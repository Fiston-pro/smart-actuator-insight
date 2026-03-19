import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import {
  SensorData, ContextData, ThresholdFlag, Brain2Result,
  HEALTHY_DEFAULTS, CONTEXT_DEFAULTS, FACTORY_THRESHOLDS,
  runBrain1, runBrain2,
} from '@/lib/brain';
import { callGeminiBrain2 } from '@/lib/gemini';
import { PipelineStage } from '@/components/PipelineTracker';
import { PipelineLogEntry } from '@/components/PipelineLog';

// ── Recalibration types ────────────────────────────────────────

type DynamicThresholds = typeof FACTORY_THRESHOLDS;

interface FPRecord {
  count: number;
  values: number[];       // flagged values that Brain 2 called false positives
  timestamps: number[];   // unix ms — used to enforce 24h window
  lastConfidence: number;
  lastAnomalyScore: number;
}

export interface RecalibrationEvent {
  id: string;
  timestamp: Date;
  signal: string;
  oldThreshold: number;
  newThreshold: number;
  fpCount: number;
  blocked: boolean;       // true if gate prevented recalibration (slow-fault suspect)
  blockReason?: string;
}

// Recalibration config
const FP_TRIGGER_COUNT = 3;           // FPs in window before recalibration considered
const FP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour rolling window
const MIN_CONFIDENCE_TO_RECAL = 85;   // Brain 2 must be confident it's really a FP
const MAX_ANOMALY_SCORE_TO_RECAL = 0.5; // If anomaly score is high, it may be a slow fault
const RECAL_FACTOR = 1.4;             // new threshold = mean(FP values) × 1.4
const RECAL_CEILING = 1.5;            // cannot exceed factory threshold × 1.5
const RECAL_STORAGE_KEY = 'actuator_dynamic_thresholds';

function loadStoredThresholds(): DynamicThresholds {
  try {
    const raw = localStorage.getItem(RECAL_STORAGE_KEY);
    if (raw) return { ...FACTORY_THRESHOLDS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...FACTORY_THRESHOLDS };
}

function saveThresholds(t: DynamicThresholds) {
  localStorage.setItem(RECAL_STORAGE_KEY, JSON.stringify(t));
}

// ── Anomaly score ──────────────────────────────────────────────

function computeAnomalyScore(sensors: SensorData, thresholds: DynamicThresholds): number {
  const torqueRatio = Math.abs(sensors.torque) / thresholds.torque;
  const powerRatio = sensors.power / thresholds.power;
  const tempRatio = sensors.temperature / thresholds.temperature;
  const gap = Math.abs(sensors.setpointPosition - sensors.feedbackPosition);
  const gapRatio = gap / thresholds.positionGap;
  return Math.min(Math.max(torqueRatio, powerRatio, tempRatio, gapRatio), 1.0);
}

function getBrain2ContextNote(sensors: SensorData, context: ContextData, result: Brain2Result): string {
  if (!result.isRealIssue) {
    if (context.co2 >= 800) return `CO₂: ${context.co2}ppm (high occupancy) → explains elevated torque`;
    if (context.outdoorTemp > 35) return `Outdoor: ${context.outdoorTemp}°C → ambient heat explains temp`;
    return 'Context explains behavior';
  }
  return `Confirmed: ${result.rootCause}`;
}

// ── Context types ──────────────────────────────────────────────

interface ActuatorState {
  sensors: SensorData;
  context: ContextData;
  flags: ThresholdFlag[];
  brain2Result: Brain2Result | null;
  isAnalyzing: boolean;
  hasAnalyzed: boolean;
  pipelineStage: PipelineStage;
  anomalyScore: number;
  brain2ContextNote: string;
  pipelineLog: PipelineLogEntry[];
  usingRealAI: boolean;
  geminiError: string | null;
  dynamicThresholds: DynamicThresholds;
  recalibrationLog: RecalibrationEvent[];
}

interface ActuatorContextType extends ActuatorState {
  updateValues: (sensors: SensorData, context: ContextData, apiKey?: string) => void;
  resetToHealthy: () => void;
  resetThresholds: () => void;
}

const ActuatorContext = createContext<ActuatorContextType | null>(null);

export function ActuatorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActuatorState>({
    sensors: HEALTHY_DEFAULTS,
    context: CONTEXT_DEFAULTS,
    flags: [],
    brain2Result: null,
    isAnalyzing: false,
    hasAnalyzed: false,
    pipelineStage: 'idle',
    anomalyScore: 0,
    brain2ContextNote: '',
    pipelineLog: [],
    usingRealAI: false,
    geminiError: null,
    dynamicThresholds: loadStoredThresholds(),
    recalibrationLog: [],
  });

  const timeoutsRef = useRef<number[]>([]);
  const fpCountersRef = useRef<Record<string, FPRecord>>({});

  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  const addTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  const addLogEntry = (entry: PipelineLogEntry) => {
    setState(prev => ({
      ...prev,
      pipelineLog: [entry, ...prev.pipelineLog].slice(0, 20),
    }));
  };

  // ── Recalibration logic ──────────────────────────────────────

  const checkAndRecalibrate = useCallback((
    signal: string,
    flaggedValue: number,
    confidence: number,
    anomalyScore: number,
    currentThresholds: DynamicThresholds
  ) => {
    const now = Date.now();
    const rec = fpCountersRef.current[signal] || { count: 0, values: [], timestamps: [], lastConfidence: 0, lastAnomalyScore: 0 };

    // Prune events outside 24h window
    const windowStart = now - FP_WINDOW_MS;
    const validIdx = rec.timestamps.map((t, i) => t >= windowStart ? i : -1).filter(i => i >= 0);
    rec.count = validIdx.length;
    rec.values = validIdx.map(i => rec.values[i]);
    rec.timestamps = validIdx.map(i => rec.timestamps[i]);

    // Add this FP
    rec.count += 1;
    rec.values.push(flaggedValue);
    rec.timestamps.push(now);
    rec.lastConfidence = confidence;
    rec.lastAnomalyScore = anomalyScore;
    fpCountersRef.current[signal] = rec;

    if (rec.count < FP_TRIGGER_COUNT) return; // not enough FPs yet

    // Safety gate: block recalibration if it might be a slow fault
    const highAnomalyScore = anomalyScore > MAX_ANOMALY_SCORE_TO_RECAL;
    const lowConfidence = confidence < MIN_CONFIDENCE_TO_RECAL;

    const oldThreshold = currentThresholds[signal as keyof DynamicThresholds] ?? 0;
    const factory = FACTORY_THRESHOLDS[signal as keyof typeof FACTORY_THRESHOLDS] ?? oldThreshold;

    if (highAnomalyScore || lowConfidence) {
      // Blocked — possible slow fault masquerading as FP
      const blockReason = highAnomalyScore
        ? `Anomaly score ${anomalyScore.toFixed(2)} > ${MAX_ANOMALY_SCORE_TO_RECAL} — possible slow fault`
        : `Confidence ${confidence}% < ${MIN_CONFIDENCE_TO_RECAL}% — verdict uncertain`;

      const event: RecalibrationEvent = {
        id: Date.now().toString(),
        timestamp: new Date(),
        signal,
        oldThreshold,
        newThreshold: oldThreshold,
        fpCount: rec.count,
        blocked: true,
        blockReason,
      };

      setState(prev => ({
        ...prev,
        recalibrationLog: [event, ...prev.recalibrationLog].slice(0, 20),
        pipelineLog: [{
          id: event.id,
          timestamp: event.timestamp,
          mainSignal: signal,
          mainValue: flaggedValue,
          unit: '',
          brain1Result: 'flagged',
          anomalyScore,
          recalibrationBlocked: true,
          recalibrationBlockReason: blockReason,
        }, ...prev.pipelineLog].slice(0, 20),
      }));

      // Reset counter so we keep watching
      fpCountersRef.current[signal] = { count: 0, values: [], timestamps: [], lastConfidence: 0, lastAnomalyScore: 0 };
      return;
    }

    // Safe to recalibrate — compute new threshold
    const meanFPValue = rec.values.reduce((a, b) => a + b, 0) / rec.values.length;
    const rawNew = meanFPValue * RECAL_FACTOR;
    const ceiling = factory * RECAL_CEILING;
    const newThreshold = Math.min(rawNew, ceiling);

    const updatedThresholds = { ...currentThresholds, [signal]: newThreshold };
    saveThresholds(updatedThresholds);

    const event: RecalibrationEvent = {
      id: Date.now().toString(),
      timestamp: new Date(),
      signal,
      oldThreshold,
      newThreshold,
      fpCount: rec.count,
      blocked: false,
    };

    setState(prev => ({
      ...prev,
      dynamicThresholds: updatedThresholds,
      recalibrationLog: [event, ...prev.recalibrationLog].slice(0, 20),
      pipelineLog: [{
        id: event.id,
        timestamp: event.timestamp,
        mainSignal: signal,
        mainValue: flaggedValue,
        unit: '',
        brain1Result: 'flagged',
        anomalyScore,
        recalibrationEvent: {
          signal,
          oldThreshold,
          newThreshold,
          fpCount: rec.count,
        },
      }, ...prev.pipelineLog].slice(0, 20),
    }));

    // Reset counter after recalibration
    fpCountersRef.current[signal] = { count: 0, values: [], timestamps: [], lastConfidence: 0, lastAnomalyScore: 0 };
  }, []);

  // ── Main pipeline ────────────────────────────────────────────

  const updateValues = useCallback((sensors: SensorData, context: ContextData, apiKey?: string) => {
    clearTimeouts();

    setState(prev => {
      const thresholds = prev.dynamicThresholds;
      const score = computeAnomalyScore(sensors, thresholds);
      const flags = runBrain1(sensors, thresholds);
      const useRealAI = !!apiKey;

      const mainFlag = flags[0];
      const mainSignal = mainFlag?.signal === 'torque' ? 'Torque' :
        mainFlag?.signal === 'power' ? 'Power' :
        mainFlag?.signal === 'temperature' ? 'Temp' :
        mainFlag?.signal === 'positionGap' ? 'Gap' : 'All';
      const mainValue = mainFlag?.value ?? Math.abs(sensors.torque);
      const mainUnit = mainFlag?.signal === 'torque' ? ' Nmm' :
        mainFlag?.signal === 'power' ? ' W' :
        mainFlag?.signal === 'temperature' ? '°C' : '%';

      // Stage 1: Data In
      const newState = {
        ...prev,
        sensors, context, flags,
        pipelineStage: 'data-in' as PipelineStage,
        anomalyScore: score,
        brain2Result: null,
        isAnalyzing: true,
        hasAnalyzed: false,
        brain2ContextNote: '',
        usingRealAI: useRealAI,
        geminiError: null,
      };

      // Schedule the rest of the pipeline
      addTimeout(() => {
        setState(p => ({ ...p, pipelineStage: 'brain1-processing' }));
      }, 400);

      addTimeout(() => {
        if (flags.length === 0) {
          setState(p => ({ ...p, pipelineStage: 'brain1-normal', isAnalyzing: false, hasAnalyzed: false }));
          addLogEntry({
            id: Date.now().toString(),
            timestamp: new Date(),
            mainSignal, mainValue, unit: mainUnit,
            brain1Result: 'normal',
            anomalyScore: score,
          });
        } else {
          setState(p => ({ ...p, pipelineStage: 'brain1-flagged' }));

          addTimeout(() => {
            setState(p => ({ ...p, pipelineStage: 'brain2-processing' }));

            const handleResult = (result: Brain2Result, fromRealAI: boolean, currentThresholds: DynamicThresholds) => {
              const note = getBrain2ContextNote(sensors, context, result);
              const stage: PipelineStage = result.isRealIssue ? 'brain2-real-issue' : 'brain2-false-positive';

              setState(p => ({
                ...p,
                brain2Result: result,
                isAnalyzing: false,
                hasAnalyzed: true,
                pipelineStage: stage,
                brain2ContextNote: note,
                usingRealAI: fromRealAI,
              }));

              addLogEntry({
                id: Date.now().toString(),
                timestamp: new Date(),
                mainSignal, mainValue, unit: mainUnit,
                brain1Result: 'flagged',
                anomalyScore: score,
                flagReason: mainFlag?.label.split(' ').slice(0, 3).join(' ') || '',
                brain2Result: result.isRealIssue ? 'real_issue' : 'false_positive',
                brain2Summary: result.tldr,
                confidence: result.confidence,
              });

              // Trigger recalibration check on false positives
              if (!result.isRealIssue && mainFlag) {
                checkAndRecalibrate(
                  mainFlag.signal,
                  mainFlag.value,
                  result.confidence,
                  score,
                  currentThresholds
                );
              }
            };

            if (useRealAI) {
              setState(p => {
                const currentThresholds = p.dynamicThresholds;
                callGeminiBrain2(apiKey!, sensors, context, flags)
                  .then(result => handleResult(result, true, currentThresholds))
                  .catch((err: Error) => {
                    setState(p2 => ({ ...p2, geminiError: err?.message || 'Gemini API call failed' }));
                    const result = runBrain2(sensors, context, flags);
                    handleResult(result, false, currentThresholds);
                  });
                return p;
              });
            } else {
              addTimeout(() => {
                setState(p => {
                  const result = runBrain2(sensors, context, flags);
                  handleResult(result, false, p.dynamicThresholds);
                  return p;
                });
              }, 1600);
            }
          }, 800);
        }
      }, 1200);

      return newState;
    });
  }, [checkAndRecalibrate]);

  const resetToHealthy = useCallback(() => {
    setState(prev => {
      updateValues(HEALTHY_DEFAULTS, CONTEXT_DEFAULTS);
      return prev;
    });
  }, [updateValues]);

  const resetThresholds = useCallback(() => {
    localStorage.removeItem(RECAL_STORAGE_KEY);
    fpCountersRef.current = {};
    setState(prev => ({ ...prev, dynamicThresholds: { ...FACTORY_THRESHOLDS }, recalibrationLog: [] }));
  }, []);

  return (
    <ActuatorContext.Provider value={{ ...state, updateValues, resetToHealthy, resetThresholds }}>
      {children}
    </ActuatorContext.Provider>
  );
}

export function useActuator() {
  const ctx = useContext(ActuatorContext);
  if (!ctx) throw new Error('useActuator must be used within ActuatorProvider');
  return ctx;
}

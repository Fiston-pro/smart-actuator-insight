import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import {
  SensorData, ContextData, ThresholdFlag, Brain2Result,
  HEALTHY_DEFAULTS, CONTEXT_DEFAULTS, THRESHOLDS,
  runBrain1, runBrain2,
} from '@/lib/brain';
import { callGeminiBrain2 } from '@/lib/gemini';
import { PipelineStage } from '@/components/PipelineTracker';
import { PipelineLogEntry } from '@/components/PipelineLog';

// Compute a simple anomaly score (0-1) based on how far values are from normal
function computeAnomalyScore(sensors: SensorData): number {
  const torqueRatio = Math.abs(sensors.torque) / THRESHOLDS.torque;
  const powerRatio = sensors.power / THRESHOLDS.power;
  const tempRatio = sensors.temperature / THRESHOLDS.temperature;
  const gap = Math.abs(sensors.setpointPosition - sensors.feedbackPosition);
  const gapRatio = gap / THRESHOLDS.positionGap;
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
}

interface ActuatorContextType extends ActuatorState {
  updateValues: (sensors: SensorData, context: ContextData, apiKey?: string) => void;
  resetToHealthy: () => void;
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
  });

  const timeoutsRef = useRef<number[]>([]);

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
      pipelineLog: [entry, ...prev.pipelineLog].slice(0, 10),
    }));
  };

  const updateValues = useCallback((sensors: SensorData, context: ContextData, apiKey?: string) => {
    clearTimeouts();

    const score = computeAnomalyScore(sensors);
    const flags = runBrain1(sensors);
    const useRealAI = !!apiKey;

    // Determine the main flagged signal for logging
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
    setState(prev => ({
      ...prev,
      sensors, context, flags,
      pipelineStage: 'data-in',
      anomalyScore: score,
      brain2Result: null,
      isAnalyzing: true,
      hasAnalyzed: false,
      brain2ContextNote: '',
      usingRealAI: useRealAI,
      geminiError: null,
    }));

    // Stage 2: Brain 1 processing
    addTimeout(() => {
      setState(prev => ({ ...prev, pipelineStage: 'brain1-processing' }));
    }, 400);

    // Stage 3: Brain 1 result
    addTimeout(() => {
      if (flags.length === 0) {
        // Normal — pipeline stops
        setState(prev => ({
          ...prev,
          pipelineStage: 'brain1-normal',
          isAnalyzing: false,
          hasAnalyzed: false,
        }));
        addLogEntry({
          id: Date.now().toString(),
          timestamp: new Date(),
          mainSignal,
          mainValue,
          unit: mainUnit,
          brain1Result: 'normal',
          anomalyScore: score,
        });
      } else {
        // Flagged — escalate
        setState(prev => ({ ...prev, pipelineStage: 'brain1-flagged' }));

        // Stage 4: Brain 2 processing
        addTimeout(() => {
          setState(prev => ({ ...prev, pipelineStage: 'brain2-processing' }));

          if (useRealAI) {
            // Real Gemini call
            callGeminiBrain2(apiKey!, sensors, context, flags)
              .then(result => {
                const note = getBrain2ContextNote(sensors, context, result);
                const stage: PipelineStage = result.isRealIssue ? 'brain2-real-issue' : 'brain2-false-positive';
                setState(prev => ({
                  ...prev,
                  brain2Result: result,
                  isAnalyzing: false,
                  hasAnalyzed: true,
                  pipelineStage: stage,
                  brain2ContextNote: note,
                }));
                addLogEntry({
                  id: Date.now().toString(),
                  timestamp: new Date(),
                  mainSignal,
                  mainValue,
                  unit: mainUnit,
                  brain1Result: 'flagged',
                  anomalyScore: score,
                  flagReason: mainFlag?.label.split(' ').slice(0, 3).join(' ') || '',
                  brain2Result: result.isRealIssue ? 'real_issue' : 'false_positive',
                  brain2Summary: result.rootCause,
                  confidence: result.confidence,
                });
              })
              .catch((err: Error) => {
                // Fall back to hardcoded, but surface the error
                const errMsg = err?.message || 'Gemini API call failed';
                setState(prev => ({ ...prev, geminiError: errMsg }));
                const result = runBrain2(sensors, context, flags);
                const note = getBrain2ContextNote(sensors, context, result);
                const stage: PipelineStage = result.isRealIssue ? 'brain2-real-issue' : 'brain2-false-positive';
                setState(prev => ({
                  ...prev,
                  brain2Result: result,
                  isAnalyzing: false,
                  hasAnalyzed: true,
                  pipelineStage: stage,
                  brain2ContextNote: note,
                  usingRealAI: false,
                }));
                addLogEntry({
                  id: Date.now().toString(),
                  timestamp: new Date(),
                  mainSignal,
                  mainValue,
                  unit: mainUnit,
                  brain1Result: 'flagged',
                  anomalyScore: score,
                  flagReason: mainFlag?.label.split(' ').slice(0, 3).join(' ') || '',
                  brain2Result: result.isRealIssue ? 'real_issue' : 'false_positive',
                  brain2Summary: result.rootCause,
                  confidence: result.confidence,
                });
              });
          } else {
            // Hardcoded fallback with delay
            addTimeout(() => {
              const result = runBrain2(sensors, context, flags);
              const note = getBrain2ContextNote(sensors, context, result);
              const stage: PipelineStage = result.isRealIssue ? 'brain2-real-issue' : 'brain2-false-positive';
              setState(prev => ({
                ...prev,
                brain2Result: result,
                isAnalyzing: false,
                hasAnalyzed: true,
                pipelineStage: stage,
                brain2ContextNote: note,
              }));
              addLogEntry({
                id: Date.now().toString(),
                timestamp: new Date(),
                mainSignal,
                mainValue,
                unit: mainUnit,
                brain1Result: 'flagged',
                anomalyScore: score,
                flagReason: mainFlag?.label.split(' ').slice(0, 3).join(' ') || '',
                brain2Result: result.isRealIssue ? 'real_issue' : 'false_positive',
                brain2Summary: result.rootCause,
                confidence: result.confidence,
              });
            }, 1600);
          }
        }, 800);
      }
    }, 1200);
  }, []);

  const resetToHealthy = useCallback(() => {
    updateValues(HEALTHY_DEFAULTS, CONTEXT_DEFAULTS);
  }, [updateValues]);

  return (
    <ActuatorContext.Provider value={{ ...state, updateValues, resetToHealthy }}>
      {children}
    </ActuatorContext.Provider>
  );
}

export function useActuator() {
  const ctx = useContext(ActuatorContext);
  if (!ctx) throw new Error('useActuator must be used within ActuatorProvider');
  return ctx;
}

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  SensorData, ContextData, ThresholdFlag, Brain2Result,
  HEALTHY_DEFAULTS, CONTEXT_DEFAULTS,
  runBrain1, runBrain2,
} from '@/lib/brain';

interface ActuatorState {
  sensors: SensorData;
  context: ContextData;
  flags: ThresholdFlag[];
  brain2Result: Brain2Result | null;
  isAnalyzing: boolean;
  hasAnalyzed: boolean;
}

interface ActuatorContextType extends ActuatorState {
  updateValues: (sensors: SensorData, context: ContextData) => void;
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
  });

  const updateValues = useCallback((sensors: SensorData, context: ContextData) => {
    const flags = runBrain1(sensors);
    if (flags.length > 0) {
      setState({ sensors, context, flags, brain2Result: null, isAnalyzing: true, hasAnalyzed: false });
      // Simulate Brain 2 thinking delay
      setTimeout(() => {
        const result = runBrain2(sensors, context, flags);
        setState(prev => ({ ...prev, brain2Result: result, isAnalyzing: false, hasAnalyzed: true }));
      }, 2000);
    } else {
      setState({ sensors, context, flags, brain2Result: null, isAnalyzing: false, hasAnalyzed: false });
    }
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

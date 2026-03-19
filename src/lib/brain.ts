// Brain 1 & Brain 2 logic for ActuatorIQ

export interface SensorData {
  torque: number;
  power: number;
  temperature: number;
  feedbackPosition: number;
  setpointPosition: number;
}

export interface ContextData {
  co2: number;
  outdoorTemp: number;
  occupancy: 'low' | 'medium' | 'high';
}

export interface ThresholdFlag {
  signal: string;
  value: number;
  threshold: number;
  label: string;
}

export interface Brain2Result {
  isRealIssue: boolean;
  confidence: number;
  verdict: string;
  rootCause: string;
  reasoning: string[];
  reasoningIcons: ('check' | 'x')[];
  actions: string[];
  urgency: 'none' | 'low' | 'medium' | 'high' | 'immediate';
  urgencyLabel: string;
  needsPhysicalInspection: boolean;
  issueSummary: string;
}

export const THRESHOLDS = {
  torque: 1.32,
  power: 0.205,
  temperature: 40.8,
  positionGap: 59.8,
};

export const HEALTHY_DEFAULTS: SensorData = {
  torque: 0.35,
  power: 0.02,
  temperature: 25.8,
  feedbackPosition: 57,
  setpointPosition: 48,
};

export const CONTEXT_DEFAULTS: ContextData = {
  co2: 450,
  outdoorTemp: 20,
  occupancy: 'low',
};

export function runBrain1(sensors: SensorData): ThresholdFlag[] {
  const flags: ThresholdFlag[] = [];
  const absTorque = Math.abs(sensors.torque);
  if (absTorque > THRESHOLDS.torque) {
    flags.push({ signal: 'torque', value: absTorque, threshold: THRESHOLDS.torque, label: `Torque ${absTorque.toFixed(2)} Nmm exceeds safe limit of ${THRESHOLDS.torque} Nmm` });
  }
  if (sensors.power > THRESHOLDS.power) {
    flags.push({ signal: 'power', value: sensors.power, threshold: THRESHOLDS.power, label: `Power ${sensors.power.toFixed(3)} W exceeds safe limit of ${THRESHOLDS.power} W` });
  }
  if (sensors.temperature > THRESHOLDS.temperature) {
    flags.push({ signal: 'temperature', value: sensors.temperature, threshold: THRESHOLDS.temperature, label: `Temperature ${sensors.temperature.toFixed(1)}°C exceeds safe limit of ${THRESHOLDS.temperature}°C` });
  }
  const gap = Math.abs(sensors.setpointPosition - sensors.feedbackPosition);
  if (gap > THRESHOLDS.positionGap) {
    flags.push({ signal: 'positionGap', value: gap, threshold: THRESHOLDS.positionGap, label: `Position gap ${gap.toFixed(1)}% exceeds safe limit of ${THRESHOLDS.positionGap}%` });
  }
  return flags;
}

export function runBrain2(sensors: SensorData, context: ContextData, flags: ThresholdFlag[]): Brain2Result {
  const torqueHigh = flags.some(f => f.signal === 'torque');
  const powerHigh = flags.some(f => f.signal === 'power');
  const tempHigh = flags.some(f => f.signal === 'temperature');
  const gapHigh = flags.some(f => f.signal === 'positionGap');

  // Torque high + low occupancy → obstruction
  if (torqueHigh && context.co2 < 800 && context.occupancy === 'low') {
    return {
      isRealIssue: true, confidence: 87,
      verdict: 'Real Issue Confirmed',
      rootCause: 'Partial valve obstruction',
      reasoning: [
        'Torque significantly above normal range',
        'Room is unoccupied with low CO2 — high demand doesn\'t explain it',
        'Not system-wide (would affect all actuators)',
      ],
      reasoningIcons: ['check', 'check', 'x'],
      actions: [
        'We can try an automated sweep cycle to clear the obstruction.',
        'If unresolved, physical inspection of the valve body is required.',
      ],
      urgency: 'medium', urgencyLabel: 'Fix within 48 hours',
      needsPhysicalInspection: true,
      issueSummary: 'Suspected obstruction at mid-range position',
    };
  }

  // Torque high + high occupancy → false positive
  if (torqueHigh && (context.co2 >= 800 || context.occupancy === 'high')) {
    return {
      isRealIssue: false, confidence: 91,
      verdict: 'False Positive — Expected Behavior',
      rootCause: 'High demand — expected behavior',
      reasoning: [
        'Torque is elevated but room is heavily occupied (high CO2)',
        'Actuator is working hard because it should be',
        'Pattern consistent with normal high-load operation',
      ],
      reasoningIcons: ['check', 'check', 'check'],
      actions: ['Continue monitoring. No intervention required.'],
      urgency: 'none', urgencyLabel: '',
      needsPhysicalInspection: false,
      issueSummary: '',
    };
  }

  // Power high + torque normal → motor wear
  if (powerHigh && !torqueHigh) {
    return {
      isRealIssue: true, confidence: 78,
      verdict: 'Real Issue Confirmed',
      rootCause: 'Early motor winding degradation',
      reasoning: [
        'Power consumption elevated while torque output remains normal',
        'Motor is losing efficiency — early sign of winding wear',
        'Degradation pattern matches known failure mode',
      ],
      reasoningIcons: ['check', 'check', 'check'],
      actions: [
        'Schedule maintenance within 30 days.',
        'Monitor power consumption trend for acceleration.',
      ],
      urgency: 'low', urgencyLabel: 'Monitor over next week',
      needsPhysicalInspection: false,
      issueSummary: 'Early motor winding degradation detected',
    };
  }

  // Temperature high
  if (tempHigh) {
    if (context.outdoorTemp > 35) {
      return {
        isRealIssue: false, confidence: 74,
        verdict: 'False Positive — Expected Behavior',
        rootCause: 'Elevated temperature due to ambient conditions',
        reasoning: [
          'Outdoor temperature is above 35°C',
          'Actuator temperature rise is consistent with ambient heat',
          'No signs of internal malfunction',
        ],
        reasoningIcons: ['check', 'check', 'x'],
        actions: ['Monitor but not critical. Ensure adequate ventilation.'],
        urgency: 'none', urgencyLabel: '',
        needsPhysicalInspection: false,
        issueSummary: '',
      };
    }
    return {
      isRealIssue: true, confidence: 83,
      verdict: 'Real Issue Confirmed',
      rootCause: 'Actuator overheating — possible excessive cycling or internal friction',
      reasoning: [
        'Temperature well above safe operating range',
        'Outdoor temperature is mild — not an environmental cause',
        'Possible excessive duty cycle or internal friction',
      ],
      reasoningIcons: ['check', 'check', 'check'],
      actions: [
        'Inspect cooling and ventilation around the actuator.',
        'Check duty cycle configuration in BMS.',
        'Physical inspection recommended if issue persists.',
      ],
      urgency: 'high', urgencyLabel: 'Immediate attention',
      needsPhysicalInspection: true,
      issueSummary: 'Actuator overheating without environmental cause',
    };
  }

  // Position gap high
  if (gapHigh) {
    return {
      isRealIssue: true, confidence: 92,
      verdict: 'Real Issue Confirmed',
      rootCause: 'Actuator not reaching setpoint — possible mechanical binding or control signal issue',
      reasoning: [
        'Large gap between setpoint and feedback position',
        'Actuator unable to reach commanded position',
        'Could be mechanical binding or control wiring issue',
      ],
      reasoningIcons: ['check', 'check', 'check'],
      actions: [
        'Check for mechanical obstruction in valve linkage.',
        'If clear, verify control wiring and BMS signal.',
        'Physical inspection required.',
      ],
      urgency: 'high', urgencyLabel: 'Immediate attention',
      needsPhysicalInspection: true,
      issueSummary: 'Actuator not reaching setpoint position',
    };
  }

  // Fallback — everything normal
  return {
    isRealIssue: false, confidence: 100,
    verdict: 'All Systems Normal',
    rootCause: '',
    reasoning: ['All readings within normal parameters'],
    reasoningIcons: ['check'],
    actions: ['System healthy. No action needed.'],
    urgency: 'none', urgencyLabel: '',
    needsPhysicalInspection: false,
    issueSummary: '',
  };
}

import { useState } from 'react';
import { useActuator } from '@/context/ActuatorContext';
import { useGemini } from '@/context/GeminiContext';
import { THRESHOLDS, HEALTHY_DEFAULTS, CONTEXT_DEFAULTS, SensorData, ContextData } from '@/lib/brain';
import { X } from 'lucide-react';

const PRESETS: { label: string; sensors: Partial<SensorData>; context?: Partial<ContextData> }[] = [
  { label: '✅ Healthy', sensors: HEALTHY_DEFAULTS, context: CONTEXT_DEFAULTS },
  { label: '🔧 Obstruction', sensors: { torque: 2.5, power: 0.035, temperature: 25.8, feedbackPosition: 57, setpointPosition: 48 }, context: { co2: 400, outdoorTemp: 22, occupancy: 'low' } },
  { label: '⚡ Motor Wear', sensors: { torque: 0.35, power: 0.4, temperature: 26, feedbackPosition: 57, setpointPosition: 48 }, context: { co2: 450, outdoorTemp: 20, occupancy: 'low' } },
  { label: '🌡 Overheating', sensors: { torque: 0.35, power: 0.02, temperature: 52, feedbackPosition: 57, setpointPosition: 48 }, context: { co2: 450, outdoorTemp: 20, occupancy: 'low' } },
];

function isExceeded(value: number, threshold: number) {
  return value > threshold;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  threshold?: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, unit, threshold, onChange }: SliderRowProps) {
  const exceeded = threshold !== undefined && isExceeded(value, threshold);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${exceeded ? 'bg-danger' : 'bg-healthy'}`} />
          <span className="text-sm">{label}</span>
        </div>
        <span className="text-sm font-mono text-muted-foreground">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

export default function SimulatorOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sensors: currentSensors, context: currentContext, updateValues } = useActuator();
  const { apiKey, isConfigured } = useGemini();
  const [sensors, setSensors] = useState<SensorData>(currentSensors);
  const [context, setContext] = useState<ContextData>(currentContext);

  if (!open) return null;

  function applyPreset(p: typeof PRESETS[0]) {
    const s = { ...HEALTHY_DEFAULTS, ...p.sensors } as SensorData;
    const c = { ...CONTEXT_DEFAULTS, ...p.context } as ContextData;
    setSensors(s);
    setContext(c);
  }

  function apply() {
    updateValues(sensors, context, isConfigured ? apiKey : undefined);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-card border-t border-border rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Simulate Actuator Conditions</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-smooth">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets */}
        <div className="flex gap-2 flex-wrap mb-5">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary hover:bg-secondary/70 transition-smooth"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Sensor Sliders */}
        <div className="space-y-4 mb-5">
          <SliderRow label="Torque (Nmm)" value={sensors.torque} min={0} max={5} step={0.1} unit=" Nmm" threshold={THRESHOLDS.torque} onChange={v => setSensors(s => ({ ...s, torque: v }))} />
          <SliderRow label="Power (W)" value={sensors.power} min={0} max={1} step={0.01} unit=" W" threshold={THRESHOLDS.power} onChange={v => setSensors(s => ({ ...s, power: v }))} />
          <SliderRow label="Temperature (°C)" value={sensors.temperature} min={15} max={70} step={0.5} unit="°C" threshold={THRESHOLDS.temperature} onChange={v => setSensors(s => ({ ...s, temperature: v }))} />
          <SliderRow label="Feedback Position (%)" value={sensors.feedbackPosition} min={0} max={100} step={1} unit="%" onChange={v => setSensors(s => ({ ...s, feedbackPosition: v }))} />
          <SliderRow label="Setpoint Position (%)" value={sensors.setpointPosition} min={0} max={100} step={1} unit="%" onChange={v => setSensors(s => ({ ...s, setpointPosition: v }))} />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">Environment</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Context */}
        <div className="space-y-4 mb-6">
          <SliderRow label="CO₂ (ppm)" value={context.co2} min={300} max={2000} step={50} unit=" ppm" onChange={v => setContext(c => ({ ...c, co2: v }))} />
          <SliderRow label="Outdoor Temp (°C)" value={context.outdoorTemp} min={-10} max={45} step={1} unit="°C" onChange={v => setContext(c => ({ ...c, outdoorTemp: v }))} />
          <div>
            <span className="text-sm mb-2 block">Occupancy</span>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map(o => (
                <button
                  key={o}
                  onClick={() => setContext(c => ({ ...c, occupancy: o }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-smooth ${
                    context.occupancy === o ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={apply}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-smooth active:scale-[0.98]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

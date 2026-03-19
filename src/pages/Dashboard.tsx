import { useActuator } from '@/context/ActuatorContext';
import { THRESHOLDS } from '@/lib/brain';
import { CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import { useState } from 'react';

function MetricTile({ label, value, unit, threshold, maxDisplay }: {
  label: string; value: number; unit: string; threshold: number; maxDisplay: number;
}) {
  const ratio = Math.min(value / threshold, 1.5);
  const percent = Math.min((value / maxDisplay) * 100, 100);
  const color = ratio < 0.7 ? 'bg-healthy' : ratio < 1 ? 'bg-warning' : 'bg-danger';
  const textColor = ratio < 0.7 ? 'text-healthy' : ratio < 1 ? 'text-warning' : 'text-danger';

  return (
    <div className="card-surface p-3 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">limit {threshold}{unit}</span>
      </div>
      <p className={`text-xl font-semibold ${textColor} transition-smooth`}>
        {value.toFixed(label === 'Power' ? 3 : label === 'Torque' ? 2 : 1)}<span className="text-sm ml-0.5">{unit}</span>
      </p>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full transition-smooth ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard({ onOpenSimulator }: { onOpenSimulator: () => void }) {
  const { sensors, flags, context } = useActuator();
  const [contextOpen, setContextOpen] = useState(false);
  const hasAnomaly = flags.length > 0;
  const posGap = Math.abs(sensors.setpointPosition - sensors.feedbackPosition);

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto animate-fade-in">
      {/* Status Card */}
      <div className={`card-surface p-5 transition-smooth ${
        hasAnomaly ? 'border-danger/40 bg-danger/5' : 'border-healthy/30 bg-healthy/5'
      }`}>
        <div className="flex items-center gap-3">
          {hasAnomaly ? (
            <AlertTriangle className="w-8 h-8 text-danger shrink-0" />
          ) : (
            <CheckCircle className="w-8 h-8 text-healthy shrink-0" />
          )}
          <div>
            <h2 className="text-lg font-semibold">
              {hasAnomaly ? '⚠ Anomaly Detected' : '✓ All Systems Normal'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasAnomaly ? flags[0].label : 'Brain 1 monitoring — no anomalies detected'}
            </p>
          </div>
        </div>
      </div>

      {/* Live Readings */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Live Readings</h3>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile label="Torque" value={Math.abs(sensors.torque)} unit=" Nmm" threshold={THRESHOLDS.torque} maxDisplay={3} />
          <MetricTile label="Power" value={sensors.power} unit=" W" threshold={THRESHOLDS.power} maxDisplay={0.5} />
          <MetricTile label="Temperature" value={sensors.temperature} unit="°C" threshold={THRESHOLDS.temperature} maxDisplay={60} />
          <MetricTile label="Position Gap" value={posGap} unit="%" threshold={THRESHOLDS.positionGap} maxDisplay={100} />
        </div>
      </div>

      {/* Context Panel */}
      <div className="card-surface overflow-hidden">
        <button
          onClick={() => setContextOpen(!contextOpen)}
          className="w-full flex items-center justify-between p-3 text-sm text-muted-foreground hover:text-foreground transition-smooth"
        >
          <span className="font-medium">Environmental Context</span>
          <ChevronDown className={`w-4 h-4 transition-smooth ${contextOpen ? 'rotate-180' : ''}`} />
        </button>
        {contextOpen && (
          <div className="px-3 pb-3 space-y-2 animate-fade-in">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'CO₂', value: `${context.co2}`, unit: 'ppm' },
                { label: 'Outdoor', value: `${context.outdoorTemp}`, unit: '°C' },
                { label: 'Occupancy', value: context.occupancy.charAt(0).toUpperCase() + context.occupancy.slice(1), unit: '' },
              ].map(item => (
                <div key={item.label} className="bg-secondary/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold">{item.value}<span className="text-[10px] text-muted-foreground ml-0.5">{item.unit}</span></p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Context is used by the AI to avoid false positives</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={onOpenSimulator}
        className="fixed bottom-20 right-4 z-30 bg-primary text-primary-foreground px-4 py-2.5 rounded-full font-medium text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-smooth active:scale-95"
      >
        Adjust Values
      </button>
    </div>
  );
}

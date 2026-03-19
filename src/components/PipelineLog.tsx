import { ChevronDown, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

export interface PipelineLogEntry {
  id: string;
  timestamp: Date;
  mainSignal: string;
  mainValue: number;
  unit: string;
  brain1Result: 'normal' | 'flagged';
  anomalyScore: number;
  flagReason?: string;
  brain2Result?: 'real_issue' | 'false_positive';
  brain2Summary?: string;
  confidence?: number;
  // Recalibration fields
  recalibrationEvent?: {
    signal: string;
    oldThreshold: number;
    newThreshold: number;
    fpCount: number;
  };
  recalibrationBlocked?: boolean;
  recalibrationBlockReason?: string;
}

interface Props {
  entries: PipelineLogEntry[];
}

export default function PipelineLog({ entries }: Props) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="card-surface overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-sm text-muted-foreground hover:text-foreground transition-smooth"
      >
        <span className="font-medium">Pipeline Log ({entries.length})</span>
        <ChevronDown className={`w-4 h-4 transition-smooth ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 max-h-56 overflow-y-auto animate-fade-in">
          {entries.slice(0, 20).map(entry => {
            const time = entry.timestamp.toLocaleTimeString('en-US', { hour12: false });

            // Recalibration blocked entry
            if (entry.recalibrationBlocked) {
              return (
                <div key={entry.id} className="flex items-start gap-1.5">
                  <ShieldAlert className="w-3 h-3 text-warning shrink-0 mt-0.5" />
                  <div className="text-[11px] font-mono text-warning leading-relaxed">
                    <span className="text-muted-foreground">{time}</span>
                    {' '}— Recalibration BLOCKED for <span className="font-semibold">{entry.mainSignal}</span>: {entry.recalibrationBlockReason}
                  </div>
                </div>
              );
            }

            // Recalibration event entry
            if (entry.recalibrationEvent) {
              const r = entry.recalibrationEvent;
              return (
                <div key={entry.id} className="flex items-start gap-1.5">
                  <RefreshCw className="w-3 h-3 text-info shrink-0 mt-0.5" />
                  <div className="text-[11px] font-mono text-info leading-relaxed">
                    <span className="text-muted-foreground">{time}</span>
                    {' '}— Recalibrated <span className="font-semibold">{r.signal}</span>: {r.oldThreshold.toFixed(3)} → {r.newThreshold.toFixed(3)} (after {r.fpCount} false positives)
                  </div>
                </div>
              );
            }

            // Normal pipeline entry
            let colorClass = 'text-healthy';
            let line = '';

            if (entry.brain1Result === 'normal') {
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ✓ Normal (score ${entry.anomalyScore.toFixed(2)})`;
            } else if (entry.brain2Result === 'real_issue') {
              colorClass = 'text-danger';
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ⚠ → Brain 2: 🔴 ${entry.brain2Summary} (${entry.confidence}%)`;
            } else if (entry.brain2Result === 'false_positive') {
              colorClass = 'text-warning';
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ⚠ → Brain 2: ✓ FP — ${entry.brain2Summary}`;
            } else {
              colorClass = 'text-orange';
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ⚠ Flagged → Brain 2: Analyzing…`;
            }

            return (
              <div key={entry.id} className={`text-[11px] font-mono ${colorClass} leading-relaxed`}>
                <span className="text-muted-foreground">{time}</span> — {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

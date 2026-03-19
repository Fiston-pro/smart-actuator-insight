import { ChevronDown } from 'lucide-react';
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
        <div className="px-3 pb-3 space-y-1 max-h-48 overflow-y-auto animate-fade-in">
          {entries.slice(0, 10).map(entry => {
            const time = entry.timestamp.toLocaleTimeString('en-US', { hour12: false });
            let colorClass = 'text-healthy';
            let line = '';

            if (entry.brain1Result === 'normal') {
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ✓ Normal (score ${entry.anomalyScore.toFixed(2)}) → Pipeline stopped`;
            } else if (entry.brain2Result === 'real_issue') {
              colorClass = 'text-danger';
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ⚠ Flagged (${entry.flagReason}) → Brain 2: 🔴 ${entry.brain2Summary} (${entry.confidence}%)`;
            } else if (entry.brain2Result === 'false_positive') {
              colorClass = 'text-warning';
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ⚠ Flagged → Brain 2: ✓ False positive (${entry.brain2Summary})`;
            } else {
              colorClass = 'text-orange';
              line = `${entry.mainSignal}: ${entry.mainValue.toFixed(2)}${entry.unit} → Brain 1: ⚠ Flagged → Brain 2: Analyzing...`;
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

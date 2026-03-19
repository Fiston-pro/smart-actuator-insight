import { useActuator } from '@/context/ActuatorContext';
import { Bot, CheckCircle, XCircle, AlertTriangle, Clock, Zap, Shield } from 'lucide-react';

function ThinkingAnimation() {
  return (
    <div className="card-surface p-8 flex flex-col items-center gap-4 animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Brain className="w-6 h-6 text-primary animate-pulse-glow" />
      </div>
      <p className="text-sm font-medium">AI analyzing…</p>
      <div className="flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-primary animate-thinking-dot-1" />
        <span className="w-2 h-2 rounded-full bg-primary animate-thinking-dot-2" />
        <span className="w-2 h-2 rounded-full bg-primary animate-thinking-dot-3" />
      </div>
    </div>
  );
}

import { Brain } from 'lucide-react';

function UrgencyBadge({ urgency, label }: { urgency: string; label: string }) {
  if (urgency === 'none' || !label) return null;
  const colors: Record<string, string> = {
    low: 'bg-info/15 text-info border-info/30',
    medium: 'bg-warning/15 text-warning border-warning/30',
    high: 'bg-danger/15 text-danger border-danger/30',
    immediate: 'bg-danger/15 text-danger border-danger/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[urgency] || ''}`}>
      <Clock className="w-3 h-3" />
      {label}
    </span>
  );
}

export default function AIAnalysis({ onNavigateVision }: { onNavigateVision: () => void }) {
  const { flags, brain2Result, isAnalyzing, hasAnalyzed } = useActuator();
  const noFlags = flags.length === 0 && !hasAnalyzed;

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto animate-fade-in">
      <h1 className="text-lg font-semibold">AI Analysis</h1>

      {noFlags && (
        <div className="card-surface p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
            <Bot className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No anomalies to investigate</p>
            <p className="text-sm text-muted-foreground mt-1">The AI analyst is on standby.</p>
          </div>
          <p className="text-xs text-muted-foreground">Adjust values on the Dashboard to simulate a fault and see the AI in action.</p>
        </div>
      )}

      {isAnalyzing && <ThinkingAnimation />}

      {brain2Result && !isAnalyzing && (
        <div className="space-y-3 animate-fade-in">
          {/* Verdict */}
          <div className={`card-surface p-4 ${
            brain2Result.isRealIssue ? 'border-danger/40 bg-danger/5' : 'border-warning/40 bg-warning/5'
          }`}>
            <div className="flex items-center gap-2">
              {brain2Result.isRealIssue ? (
                <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
              ) : (
                <Shield className="w-5 h-5 text-warning shrink-0" />
              )}
              <div>
                <p className="font-semibold text-sm">
                  {brain2Result.isRealIssue ? '🔴 ' : '🟡 '}{brain2Result.verdict}
                </p>
                <p className="text-xs text-muted-foreground">{brain2Result.confidence}% confidence</p>
              </div>
            </div>
          </div>

          {/* Root Cause */}
          {brain2Result.rootCause && (
            <div className="card-surface p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Root Cause</h3>
              <p className="font-semibold">{brain2Result.rootCause}</p>
              <div className="space-y-1.5">
                {brain2Result.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {brain2Result.reasoningIcons[i] === 'check' ? (
                      <CheckCircle className="w-4 h-4 text-healthy shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-muted-foreground">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="card-surface p-4 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What To Do</h3>
            <div className="space-y-2">
              {brain2Result.actions.map((a, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <UrgencyBadge urgency={brain2Result.urgency} label={brain2Result.urgencyLabel} />
              {brain2Result.isRealIssue && (
                <button
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth"
                >
                  <Zap className="w-3 h-3" /> Try Auto-Fix
                </button>
              )}
              {brain2Result.needsPhysicalInspection && (
                <button
                  onClick={onNavigateVision}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-smooth"
                >
                  Open Vision Guide
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

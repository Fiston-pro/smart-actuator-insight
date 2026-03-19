import { useActuator } from '@/context/ActuatorContext';
import { useGemini } from '@/context/GeminiContext';
import { FACTORY_THRESHOLDS } from '@/lib/brain';
import { Bot, CheckCircle, XCircle, AlertTriangle, Clock, Zap, Shield, Brain, Info, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';

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
  const { flags, brain2Result, isAnalyzing, hasAnalyzed, usingRealAI, geminiError, dynamicThresholds, recalibrationLog, resetThresholds } = useActuator();
  const { isConfigured } = useGemini();
  const noFlags = flags.length === 0 && !hasAnalyzed;

  const isRecalibrated = Object.keys(dynamicThresholds).some(
    k => dynamicThresholds[k as keyof typeof dynamicThresholds] !== FACTORY_THRESHOLDS[k as keyof typeof FACTORY_THRESHOLDS]
  );

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">AI Analysis</h1>
        {recalibrationLog.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-info flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> {recalibrationLog.filter(r => !r.blocked).length} recalibrations
            </span>
            {isRecalibrated && (
              <button
                onClick={resetThresholds}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                reset to factory
              </button>
            )}
          </div>
        )}
      </div>

      {/* Banner when no API key */}
      {!isConfigured && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/20">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-info">Using simulated AI responses. Add your Gemini API key in Settings for real analysis.</p>
        </div>
      )}

      {/* Gemini error banner */}
      {geminiError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-danger font-medium">Gemini API error — using fallback AI</p>
            <p className="text-[10px] text-danger/80 mt-0.5">{geminiError}</p>
          </div>
        </div>
      )}

      {/* Real AI indicator */}
      {usingRealAI && hasAnalyzed && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-healthy/10 border border-healthy/20 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-healthy" />
          <span className="text-[10px] text-healthy font-medium">Powered by Gemini 2.5 Flash</span>
        </div>
      )}

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

          {/* TL;DR — the only thing a technician needs to read */}
          <div className={`card-surface p-4 ${
            brain2Result.isRealIssue ? 'border-danger/40 bg-danger/5' : 'border-warning/40 bg-warning/5'
          }`}>
            <p className="text-base font-bold leading-snug">{brain2Result.tldr}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{brain2Result.confidence}% confidence</span>
              <UrgencyBadge urgency={brain2Result.urgency} label={brain2Result.urgencyLabel} />
            </div>
          </div>

          {/* Needs more info banner */}
          {brain2Result.needsMoreInfo && brain2Result.missingInfo.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/20">
              <HelpCircle className="w-4 h-4 text-info shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-info font-medium">More data would improve this verdict</p>
                <ul className="mt-1 space-y-0.5">
                  {brain2Result.missingInfo.map((item, i) => (
                    <li key={i} className="text-[11px] text-info/80">• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Root Cause + Reasoning (collapsible detail) */}
          {brain2Result.rootCause && (
            <div className="card-surface p-4 space-y-3">
              <div className="flex items-center gap-2">
                {brain2Result.isRealIssue
                  ? <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  : <Shield className="w-4 h-4 text-warning shrink-0" />}
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Root Cause</h3>
              </div>
              <p className="font-semibold text-sm">{brain2Result.rootCause}</p>
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
              {brain2Result.isRealIssue && (
                <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth">
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

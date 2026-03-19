import { Radio, Brain, Cloud, ClipboardList, Shield } from 'lucide-react';

export type PipelineStage =
  | 'idle'
  | 'data-in'
  | 'brain1-processing'
  | 'brain1-normal'
  | 'brain1-flagged'
  | 'brain2-processing'
  | 'brain2-false-positive'
  | 'brain2-real-issue'
  | 'result';

interface Props {
  stage: PipelineStage;
  anomalyScore: number;
  brain2ContextNote: string;
}

interface NodeConfig {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  color: string; // tailwind classes
  pulse: boolean;
  dim: boolean;
}

function getNodeConfigs(stage: PipelineStage, anomalyScore: number, brain2ContextNote: string): NodeConfig[] {
  const brain1Stopped = stage === 'brain1-normal';
  const brain2Done = stage === 'brain2-false-positive' || stage === 'brain2-real-issue';
  const hasResult = stage === 'result';

  // Node 1: Data In — always active
  const node1: NodeConfig = {
    icon: <Radio className="w-4 h-4" />,
    label: 'Data In',
    sublabel: 'Receiving sensor data',
    color: 'bg-info text-info',
    pulse: false,
    dim: false,
  };

  // Node 2: Brain 1
  let node2: NodeConfig;
  if (stage === 'brain1-processing') {
    node2 = { icon: <Brain className="w-4 h-4" />, label: 'Brain 1: Edge AI', sublabel: 'Analyzing...', color: 'bg-info text-info', pulse: true, dim: false };
  } else if (stage === 'brain1-normal') {
    node2 = { icon: <Brain className="w-4 h-4" />, label: 'Brain 1: Edge AI', sublabel: `✓ Normal — no escalation\nScore: ${anomalyScore.toFixed(2)}`, color: 'bg-healthy text-healthy', pulse: false, dim: false };
  } else if (['brain1-flagged', 'brain2-processing', 'brain2-false-positive', 'brain2-real-issue', 'result'].includes(stage)) {
    node2 = { icon: <Brain className="w-4 h-4" />, label: 'Brain 1: Edge AI', sublabel: `⚠ Anomaly — escalating\nScore: ${anomalyScore.toFixed(2)}`, color: 'bg-orange text-orange', pulse: false, dim: false };
  } else {
    node2 = { icon: <Brain className="w-4 h-4" />, label: 'Brain 1: Edge AI', sublabel: 'Idle', color: 'bg-muted text-muted-foreground', pulse: false, dim: true };
  }

  // Node 3: Brain 2
  let node3: NodeConfig;
  if (brain1Stopped) {
    node3 = { icon: <Cloud className="w-4 h-4" />, label: 'Brain 2: Cloud LLM', sublabel: 'Not needed', color: 'bg-muted text-muted-foreground', pulse: false, dim: true };
  } else if (stage === 'brain2-processing') {
    node3 = { icon: <Cloud className="w-4 h-4" />, label: 'Brain 2: Cloud LLM', sublabel: 'Gemini analyzing with full context...', color: 'bg-purple-500 text-purple-400', pulse: true, dim: false };
  } else if (stage === 'brain2-false-positive') {
    node3 = { icon: <Shield className="w-4 h-4" />, label: 'Brain 2: Cloud LLM', sublabel: `✓ False positive filtered\n${brain2ContextNote}`, color: 'bg-warning text-warning', pulse: false, dim: false };
  } else if (stage === 'brain2-real-issue' || (hasResult && brain2ContextNote.includes('Confirmed'))) {
    node3 = { icon: <Cloud className="w-4 h-4" />, label: 'Brain 2: Cloud LLM', sublabel: `🔴 Confirmed issue — RCA generated\n${brain2ContextNote}`, color: 'bg-danger text-danger', pulse: false, dim: false };
  } else {
    node3 = { icon: <Cloud className="w-4 h-4" />, label: 'Brain 2: Cloud LLM', sublabel: 'Idle', color: 'bg-muted text-muted-foreground', pulse: false, dim: true };
  }

  // Node 4: Result
  let node4: NodeConfig;
  if (brain1Stopped) {
    node4 = { icon: <ClipboardList className="w-4 h-4" />, label: 'Result', sublabel: 'All clear', color: 'bg-healthy text-healthy', pulse: false, dim: true };
  } else if (hasResult || brain2Done) {
    if (stage === 'brain2-false-positive') {
      node4 = { icon: <ClipboardList className="w-4 h-4" />, label: 'Result', sublabel: 'Monitor', color: 'bg-warning text-warning', pulse: false, dim: false };
    } else {
      node4 = { icon: <ClipboardList className="w-4 h-4" />, label: 'Result', sublabel: 'Action needed', color: 'bg-danger text-danger', pulse: true, dim: false };
    }
  } else {
    node4 = { icon: <ClipboardList className="w-4 h-4" />, label: 'Result', sublabel: '', color: 'bg-muted text-muted-foreground', pulse: false, dim: true };
  }

  return [node1, node2, node3, node4];
}

function getLineActive(index: number, stage: PipelineStage): 'active' | 'processing' | 'inactive' {
  // Line 0: Data In → Brain 1
  if (index === 0) {
    if (['data-in', 'brain1-processing', 'brain1-normal', 'brain1-flagged', 'brain2-processing', 'brain2-false-positive', 'brain2-real-issue', 'result'].includes(stage))
      return stage === 'data-in' ? 'processing' : 'active';
    return 'inactive';
  }
  // Line 1: Brain 1 → Brain 2
  if (index === 1) {
    if (stage === 'brain1-normal') return 'inactive'; // pipeline stopped
    if (['brain1-flagged'].includes(stage)) return 'processing';
    if (['brain2-processing', 'brain2-false-positive', 'brain2-real-issue', 'result'].includes(stage)) return 'active';
    return 'inactive';
  }
  // Line 2: Brain 2 → Result
  if (index === 2) {
    if (['brain2-false-positive', 'brain2-real-issue', 'result'].includes(stage)) return 'active';
    return 'inactive';
  }
  return 'inactive';
}

export default function PipelineTracker({ stage, anomalyScore, brain2ContextNote }: Props) {
  const nodes = getNodeConfigs(stage, anomalyScore, brain2ContextNote);

  return (
    <div className="card-surface p-3 overflow-x-auto">
      <div className="flex items-start min-w-[540px]">
        {nodes.map((node, i) => (
          <div key={i} className="flex items-start flex-1">
            {/* Node */}
            <div className={`flex flex-col items-center text-center flex-shrink-0 transition-smooth ${node.dim ? 'opacity-40' : 'opacity-100'}`} style={{ width: 100 }}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${node.color.split(' ')[0]}/15 border border-current/20 transition-smooth ${node.pulse ? 'animate-pulse-glow' : ''}`}>
                <span className={node.color.split(' ').slice(1).join(' ')}>{node.icon}</span>
              </div>
              <span className="text-[10px] font-medium mt-1.5 leading-tight">{node.label}</span>
              {node.sublabel && (
                <span className="text-[9px] text-muted-foreground mt-0.5 leading-tight whitespace-pre-line max-w-[110px]">{node.sublabel}</span>
              )}
            </div>
            {/* Connecting line */}
            {i < 3 && (
              <div className="flex-1 flex items-center pt-4 px-1">
                <div className="h-0.5 w-full rounded-full overflow-hidden bg-muted relative">
                  {getLineActive(i, stage) === 'active' && (
                    <div className="absolute inset-0 bg-primary transition-smooth" />
                  )}
                  {getLineActive(i, stage) === 'processing' && (
                    <div className="absolute inset-0 bg-primary/50 animate-pipeline-flow" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

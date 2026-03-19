import { useState, useEffect, useRef } from 'react';
import { ActuatorProvider, useActuator } from '@/context/ActuatorContext';
import { GeminiProvider, useGemini } from '@/context/GeminiContext';
import BottomNav from '@/components/BottomNav';
import SimulatorOverlay from '@/components/SimulatorOverlay';
import SettingsModal from '@/components/SettingsModal';
import Dashboard from '@/pages/Dashboard';
import AIAnalysis from '@/pages/AIAnalysis';
import VisionGuide from '@/pages/VisionGuide';
import { toast } from 'sonner';

function AppContent() {
  const [tab, setTab] = useState('dashboard');
  const [simOpen, setSimOpen] = useState(false);
  const { flags, brain2Result, hasAnalyzed } = useActuator();
  const prevFlagsRef = useRef(flags.length);

  useEffect(() => {
    if (flags.length > 0 && prevFlagsRef.current === 0) {
      toast.warning('Brain 1: Anomaly detected', { description: flags[0].label });
    }
    prevFlagsRef.current = flags.length;
  }, [flags]);

  useEffect(() => {
    if (brain2Result && hasAnalyzed) {
      toast.info('Brain 2: Analysis complete', {
        description: brain2Result.verdict,
      });
    }
  }, [brain2Result, hasAnalyzed]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with settings */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 max-w-lg mx-auto">
        <h1 className="text-sm font-semibold text-muted-foreground">ActuatorIQ</h1>
        <SettingsModal />
      </div>

      {tab === 'dashboard' && <Dashboard onOpenSimulator={() => setSimOpen(true)} />}
      {tab === 'analysis' && <AIAnalysis onNavigateVision={() => setTab('vision')} />}
      {tab === 'vision' && <VisionGuide />}
      <BottomNav activeTab={tab} onTabChange={setTab} hasAlert={flags.length > 0} />
      <SimulatorOverlayWrapper open={simOpen} onClose={() => setSimOpen(false)} />
    </div>
  );
}

// Wrapper to pass API key to updateValues
function SimulatorOverlayWrapper({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <SimulatorOverlay open={open} onClose={onClose} />;
}

export default function Index() {
  return (
    <GeminiProvider>
      <ActuatorProvider>
        <AppContent />
      </ActuatorProvider>
    </GeminiProvider>
  );
}

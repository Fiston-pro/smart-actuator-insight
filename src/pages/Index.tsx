import { useState } from 'react';
import { ActuatorProvider, useActuator } from '@/context/ActuatorContext';
import BottomNav from '@/components/BottomNav';
import SimulatorOverlay from '@/components/SimulatorOverlay';
import Dashboard from '@/pages/Dashboard';
import AIAnalysis from '@/pages/AIAnalysis';
import VisionGuide from '@/pages/VisionGuide';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';

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
      {tab === 'dashboard' && <Dashboard onOpenSimulator={() => setSimOpen(true)} />}
      {tab === 'analysis' && <AIAnalysis onNavigateVision={() => setTab('vision')} />}
      {tab === 'vision' && <VisionGuide />}
      <BottomNav activeTab={tab} onTabChange={setTab} hasAlert={flags.length > 0} />
      <SimulatorOverlay open={simOpen} onClose={() => setSimOpen(false)} />
    </div>
  );
}

export default function Index() {
  return (
    <ActuatorProvider>
      <AppContent />
    </ActuatorProvider>
  );
}

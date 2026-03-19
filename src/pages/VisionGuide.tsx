import { useActuator } from '@/context/ActuatorContext';
import { Camera, Smartphone, MessageSquare } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  text: string;
  buttons?: { label: string; action: string }[];
}

const GUIDE_STEPS: ChatMessage[] = [
  { text: "I can see the actuator. Based on the diagnostics, here's what we need to do:" },
  { text: "Step 1: Locate the manual override — it's the small lever on top of the housing." },
  { text: "Step 2: Pull the override lever toward you to switch to manual mode." },
  {
    text: "Step 3: Slowly rotate through full range. Notice any resistance?",
    buttons: [
      { label: "Yes, I feel resistance", action: "resistance" },
      { label: "No, moves freely", action: "free" },
    ],
  },
];

const RESISTANCE_MSG: ChatMessage = {
  text: "That confirms the obstruction. Step 4: Remove the 4 mounting screws to access the valve body. I'll guide you through cleaning.",
};

const FREE_MSG: ChatMessage = {
  text: "Good news — the actuator moves freely now. The automated sweep may have cleared it. Let's verify by running a check.",
  buttons: [{ label: "Run Verification", action: "verify" }],
};

export default function VisionGuide() {
  const { brain2Result } = useActuator();
  const [cameraActive, setCameraActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasIssue = brain2Result?.isRealIssue && brain2Result.needsPhysicalInspection;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleCount, messages]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setMessages(GUIDE_STEPS);
      setVisibleCount(0);
      // Reveal messages one by one
      for (let i = 0; i < GUIDE_STEPS.length; i++) {
        await new Promise(r => setTimeout(r, 1500));
        setVisibleCount(prev => prev + 1);
      }
    } catch {
      // Camera denied
    }
  }

  function handleResponse(action: string) {
    if (action === 'resistance') {
      setMessages(prev => [...prev, RESISTANCE_MSG]);
      setVisibleCount(prev => prev + 1);
    } else if (action === 'free' || action === 'verify') {
      setMessages(prev => [...prev, FREE_MSG]);
      setVisibleCount(prev => prev + 1);
    }
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto animate-fade-in">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">AI-Guided Repair</h1>
      </div>

      {!hasIssue ? (
        <div className="card-surface p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
            <Camera className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No active issue to guide</p>
          <p className="text-sm text-muted-foreground">Simulate a fault on the Dashboard first.</p>
        </div>
      ) : (
        <>
          <div className="card-surface p-3">
            <p className="text-sm"><span className="text-muted-foreground">Issue: </span>{brain2Result.issueSummary}</p>
          </div>

          {!cameraActive ? (
            <button
              onClick={startCamera}
              className="w-full card-surface p-6 flex flex-col items-center gap-3 hover:border-primary/40 transition-smooth"
            >
              <Camera className="w-8 h-8 text-primary" />
              <span className="font-medium">Start Camera</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden aspect-[4/3] bg-secondary">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              </div>

              {/* Chat */}
              <div className="card-surface p-3 max-h-64 overflow-y-auto space-y-3">
                {messages.slice(0, visibleCount).map((msg, i) => (
                  <div key={i} className="animate-fade-in">
                    <div className="flex gap-2">
                      <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm">{msg.text}</p>
                    </div>
                    {msg.buttons && i === visibleCount - 1 && (
                      <div className="flex gap-2 mt-2 ml-6 flex-wrap">
                        {msg.buttons.map(btn => (
                          <button
                            key={btn.action}
                            onClick={() => handleResponse(btn.action)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

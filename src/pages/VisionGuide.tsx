import { useActuator } from '@/context/ActuatorContext';
import { useGemini } from '@/context/GeminiContext';
import { callGeminiVision, callGeminiVisionText } from '@/lib/gemini';
import { Camera, Smartphone, MessageSquare, Send, Info, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  text: string;
  sender: 'ai' | 'user';
  buttons?: { label: string; action: string }[];
}

const GUIDE_STEPS: ChatMessage[] = [
  { text: "I can see the actuator. Based on the diagnostics, here's what we need to do:", sender: 'ai' },
  { text: "Step 1: Locate the manual override — it's the small lever on top of the housing.", sender: 'ai' },
  { text: "Step 2: Pull the override lever toward you to switch to manual mode.", sender: 'ai' },
  {
    text: "Step 3: Slowly rotate through full range. Notice any resistance?",
    sender: 'ai',
    buttons: [
      { label: "Yes, I feel resistance", action: "resistance" },
      { label: "No, moves freely", action: "free" },
    ],
  },
];

const RESISTANCE_MSG: ChatMessage = {
  text: "That confirms the obstruction. Step 4: Remove the 4 mounting screws to access the valve body. I'll guide you through cleaning.",
  sender: 'ai',
};

const FREE_MSG: ChatMessage = {
  text: "Good news — the actuator moves freely now. The automated sweep may have cleared it. Let's verify by running a check.",
  sender: 'ai',
  buttons: [{ label: "Run Verification", action: "verify" }],
};

export default function VisionGuide() {
  const { brain2Result } = useActuator();
  const { apiKey, isConfigured } = useGemini();
  const [cameraActive, setCameraActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasIssue = brain2Result?.isRealIssue && brain2Result.needsPhysicalInspection;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleCount, messages]);

  function captureFrame(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]; // base64 only
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      if (!isConfigured) {
        // Use mock messages
        setMessages(GUIDE_STEPS);
        setVisibleCount(0);
        for (let i = 0; i < GUIDE_STEPS.length; i++) {
          await new Promise(r => setTimeout(r, 1500));
          setVisibleCount(prev => prev + 1);
        }
      } else {
        // Real AI — send initial frame
        setMessages([{ text: 'Camera started. Tap "Send to AI" to analyze what the camera sees.', sender: 'ai' }]);
        setVisibleCount(1);
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

  async function sendToAI() {
    if (!isConfigured || isSending) return;
    const frame = captureFrame();
    if (!frame) return;

    setIsSending(true);
    try {
      const previousTexts = messages.filter(m => m.sender === 'ai').map(m => m.text);
      const response = await callGeminiVision(apiKey, frame, brain2Result?.issueSummary || 'Unknown issue', previousTexts);
      setMessages(prev => [...prev, { text: response, sender: 'ai' }]);
      setVisibleCount(prev => prev + 1);
    } catch {
      setMessages(prev => [...prev, { text: 'Failed to analyze image. Please try again.', sender: 'ai' }]);
      setVisibleCount(prev => prev + 1);
    }
    setIsSending(false);
  }

  async function sendTextQuestion() {
    if (!isConfigured || !textInput.trim() || isSending) return;
    const question = textInput.trim();
    setTextInput('');
    setMessages(prev => [...prev, { text: question, sender: 'user' }]);
    setVisibleCount(prev => prev + 1);

    setIsSending(true);
    try {
      const frame = captureFrame();
      if (frame) {
        const response = await callGeminiVisionText(apiKey, frame, question, brain2Result?.issueSummary || 'Unknown issue');
        setMessages(prev => [...prev, { text: response, sender: 'ai' }]);
        setVisibleCount(prev => prev + 1);
      }
    } catch {
      setMessages(prev => [...prev, { text: 'Failed to get response.', sender: 'ai' }]);
      setVisibleCount(prev => prev + 1);
    }
    setIsSending(false);
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto animate-fade-in">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">AI-Guided Repair</h1>
      </div>

      {/* Banner when no API key */}
      {!isConfigured && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/20">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-info">Add Gemini API key in Settings for real AI-guided repair.</p>
        </div>
      )}

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
              <div className="rounded-xl overflow-hidden aspect-[4/3] bg-secondary relative">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                {/* Hidden canvas for frame capture */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Send to AI button overlay */}
                {isConfigured && (
                  <button
                    onClick={sendToAI}
                    disabled={isSending}
                    className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                    Send to AI
                  </button>
                )}
              </div>

              {/* Chat */}
              <div className="card-surface p-3 max-h-64 overflow-y-auto space-y-3">
                {messages.slice(0, visibleCount).map((msg, i) => (
                  <div key={i} className="animate-fade-in">
                    {msg.sender === 'user' ? (
                      <div className="flex justify-end">
                        <div className="bg-primary/15 text-sm px-3 py-1.5 rounded-lg max-w-[80%]">{msg.text}</div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm">{msg.text}</p>
                      </div>
                    )}
                    {msg.buttons && msg.sender === 'ai' && i === visibleCount - 1 && !isConfigured && (
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

              {/* Text input for AI questions */}
              {isConfigured && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendTextQuestion()}
                    placeholder="Ask about what you see..."
                    className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={sendTextQuestion}
                    disabled={!textInput.trim() || isSending}
                    className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth disabled:opacity-50"
                  >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

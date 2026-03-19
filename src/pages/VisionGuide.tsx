import { useActuator } from '@/context/ActuatorContext';
import { useGemini } from '@/context/GeminiContext';
import { callGeminiVision, callGeminiVisionText } from '@/lib/gemini';
import { Camera, MessageSquare, Send, Info, Loader2, Radio, CameraOff, Zap } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';

interface ChatMessage {
  text: string;
  sender: 'ai' | 'user';
  hasFrame?: boolean;
}

export default function VisionGuide() {
  const { brain2Result } = useActuator();
  const { apiKey, isConfigured } = useGemini();

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [liveMode, setLiveMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveIntervalRef = useRef<number | null>(null);

  const hasIssue = !!brain2Result;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Attach stream to video element after it appears in the DOM
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function captureFrame(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  }

  function stopCamera() {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setCameraError(null);
    try {
      // Try rear camera first, fall back to any camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      setCameraActive(true); // triggers re-render → new <video> in DOM → useEffect attaches stream

      // Auto-analyze first frame after a short delay for video to render
      if (isConfigured) {
        setTimeout(async () => {
          const frame = captureFrame();
          if (!frame) return;
          setIsSending(true);
          try {
            const resp = await callGeminiVision(
              apiKey, frame,
              brain2Result?.issueSummary || 'General inspection',
              []
            );
            setMessages([{ text: resp, sender: 'ai', hasFrame: true }]);
          } catch {
            setMessages([{ text: 'Camera ready. Ask me anything about what you see.', sender: 'ai' }]);
          }
          setIsSending(false);
        }, 1200);
      } else {
        setMessages([{ text: "Camera is live. I can guide you through the inspection — add your Gemini API key in Settings to enable real AI analysis.", sender: 'ai' }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('Permission') || msg.includes('permission') || msg.includes('denied')) {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (msg.includes('NotFound') || msg.includes('not found')) {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera error: ${msg}`);
      }
    }
  }

  function handleStopCamera() {
    stopCamera();
    setCameraActive(false);
    setLiveMode(false);
    setMessages([]);
  }

  const runLiveAnalysis = useCallback(async () => {
    if (isSending || !isConfigured) return;
    const frame = captureFrame();
    if (!frame) return;
    setIsSending(true);
    try {
      const previousTexts = messages.slice(-3).filter(m => m.sender === 'ai').map(m => m.text);
      const resp = await callGeminiVision(
        apiKey, frame,
        brain2Result?.issueSummary || 'General inspection',
        previousTexts
      );
      setMessages(prev => [...prev, { text: resp, sender: 'ai', hasFrame: true }]);
    } catch {
      // silent in live mode
    }
    setIsSending(false);
  }, [apiKey, brain2Result, isConfigured, isSending, messages]);

  // Toggle live mode
  useEffect(() => {
    if (liveMode && cameraActive && isConfigured) {
      liveIntervalRef.current = window.setInterval(runLiveAnalysis, 8000);
    } else {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    }
    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, [liveMode, cameraActive, isConfigured, runLiveAnalysis]);

  async function sendTextQuestion() {
    if (!textInput.trim() || isSending) return;
    const question = textInput.trim();
    setTextInput('');
    setMessages(prev => [...prev, { text: question, sender: 'user' }]);
    setIsSending(true);
    try {
      const frame = captureFrame();
      let response: string;
      if (frame && isConfigured) {
        response = await callGeminiVisionText(apiKey, frame, question, brain2Result?.issueSummary || 'General inspection');
      } else if (!isConfigured) {
        response = 'Add your Gemini API key in Settings to enable real AI responses.';
      } else {
        response = 'Could not capture frame. Make sure the camera is active.';
      }
      setMessages(prev => [...prev, { text: response, sender: 'ai', hasFrame: !!frame }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get response.';
      setMessages(prev => [...prev, { text: msg, sender: 'ai' }]);
    }
    setIsSending(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] max-w-2xl mx-auto px-4 pt-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">AI Vision Guide</h1>
        </div>
        {cameraActive && isConfigured && (
          <button
            onClick={() => setLiveMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth ${
              liveMode
                ? 'bg-danger/15 text-danger border-danger/30'
                : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {liveMode ? <Radio className="w-3 h-3 animate-pulse" /> : <Zap className="w-3 h-3" />}
            {liveMode ? 'Live ON' : 'Live OFF'}
          </button>
        )}
      </div>

      {/* No API key banner */}
      {!isConfigured && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/20 mb-3 shrink-0">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-info">Add Gemini API key in Settings for real AI-guided repair with live camera analysis.</p>
        </div>
      )}

      {!cameraActive ? (
        /* ── Pre-camera state ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="card-surface p-8 flex flex-col items-center gap-4 text-center w-full">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-base">AI Vision Ready</p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasIssue
                  ? `Active issue: ${brain2Result.issueSummary}`
                  : 'Point your camera at any actuator for AI analysis'}
              </p>
            </div>
            {cameraError && (
              <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 w-full text-left">
                {cameraError}
              </p>
            )}
            <button
              onClick={startCamera}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-smooth flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Start Camera
            </button>
          </div>
        </div>
      ) : (
        /* ── Active camera + chat ── */
        <div className="flex-1 flex flex-col gap-3 min-h-0">

          {/* Camera feed */}
          <div className="relative rounded-xl overflow-hidden bg-black shrink-0" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Live badge */}
            {liveMode && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger text-white text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </div>
            )}

            {/* Controls overlay */}
            <div className="absolute bottom-3 right-3 flex gap-2">
              {isConfigured && (
                <button
                  onClick={runLiveAnalysis}
                  disabled={isSending}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth flex items-center gap-1.5 disabled:opacity-50 shadow-lg"
                >
                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                  Analyze
                </button>
              )}
              <button
                onClick={handleStopCamera}
                className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-smooth"
              >
                <CameraOff className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 card-surface p-3 overflow-y-auto space-y-3 min-h-0">
            {messages.length === 0 && isSending && (
              <div className="flex gap-2 items-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm">Analyzing camera feed…</span>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className="animate-fade-in">
                {msg.sender === 'user' ? (
                  <div className="flex justify-end">
                    <div className="bg-primary/15 text-sm px-3 py-2 rounded-xl max-w-[80%]">{msg.text}</div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      {msg.hasFrame && (
                        <span className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Camera className="w-2.5 h-2.5" /> analyzed live frame
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isSending && messages.length > 0 && (
              <div className="flex gap-2 items-center">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Loader2 className="w-3 h-3 text-primary animate-spin" />
                </div>
                <span className="text-sm text-muted-foreground">Analyzing…</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 shrink-0">
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendTextQuestion()}
              placeholder={isConfigured ? 'Ask about what you see…' : 'Add API key to chat with AI…'}
              disabled={!isConfigured}
              className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={sendTextQuestion}
              disabled={!textInput.trim() || isSending || !isConfigured}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth disabled:opacity-50"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

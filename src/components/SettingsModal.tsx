import { useState } from 'react';
import { useGemini } from '@/context/GeminiContext';
import { Settings, Eye, EyeOff, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';

export default function SettingsModal() {
  const { apiKey, status, setApiKey, testConnection } = useGemini();
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);

  const statusConfig: Record<string, { label: string; color: string }> = {
    not_configured: { label: 'Not configured', color: 'text-muted-foreground' },
    testing: { label: 'Testing...', color: 'text-info' },
    connected: { label: 'Connected', color: 'text-healthy' },
    invalid: { label: 'Invalid key', color: 'text-danger' },
  };

  const { label, color } = statusConfig[status];

  async function handleTest() {
    setApiKey(localKey);
    // Small delay so state propagates
    await new Promise(r => setTimeout(r, 50));
    await testConnection();
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-2 rounded-lg hover:bg-secondary transition-smooth text-muted-foreground hover:text-foreground">
          <Settings className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Configure your API keys for real AI analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Gemini API Key
            </label>
            <div className="relative mt-1.5">
              <input
                type={showKey ? 'text' : 'password'}
                value={localKey}
                onChange={e => setLocalKey(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={!localKey || status === 'testing'}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth disabled:opacity-50 flex items-center gap-1.5"
            >
              {status === 'testing' && <Loader2 className="w-3 h-3 animate-spin" />}
              Test Connection
            </button>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-healthy' :
                status === 'invalid' ? 'bg-danger' :
                status === 'testing' ? 'bg-info animate-pulse' : 'bg-muted-foreground'
              }`} />
              <span className={`text-xs ${color}`}>{label}</span>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Get your API key from{' '}
            <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              aistudio.google.com
            </a>
            . Used for AI analysis and vision guide.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

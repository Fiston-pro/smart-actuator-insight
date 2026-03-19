import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { testGeminiConnection } from '@/lib/gemini';

type ConnectionStatus = 'not_configured' | 'testing' | 'connected' | 'invalid';

interface GeminiContextType {
  apiKey: string;
  status: ConnectionStatus;
  setApiKey: (key: string) => void;
  testConnection: () => Promise<void>;
  isConfigured: boolean;
}

const GeminiContext = createContext<GeminiContextType | null>(null);

export function GeminiProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    localStorage.getItem('gemini_api_key') ? 'connected' : 'not_configured'
  );

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      setStatus('not_configured'); // reset until tested
    } else {
      localStorage.removeItem('gemini_api_key');
      setStatus('not_configured');
    }
  }, []);

  const testConnectionFn = useCallback(async () => {
    if (!apiKey) {
      setStatus('not_configured');
      return;
    }
    setStatus('testing');
    const ok = await testGeminiConnection(apiKey);
    setStatus(ok ? 'connected' : 'invalid');
    if (ok) localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  return (
    <GeminiContext.Provider value={{
      apiKey,
      status,
      setApiKey,
      testConnection: testConnectionFn,
      isConfigured: status === 'connected' && !!apiKey,
    }}>
      {children}
    </GeminiContext.Provider>
  );
}

export function useGemini() {
  const ctx = useContext(GeminiContext);
  if (!ctx) throw new Error('useGemini must be used within GeminiProvider');
  return ctx;
}

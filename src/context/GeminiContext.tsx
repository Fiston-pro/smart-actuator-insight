import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { testGeminiConnection } from '@/lib/gemini';

type ConnectionStatus = 'not_configured' | 'testing' | 'connected' | 'invalid';

interface GeminiContextType {
  apiKey: string;
  status: ConnectionStatus;
  connectionError: string | null;
  setApiKey: (key: string) => void;
  testConnection: () => Promise<void>;
  isConfigured: boolean;
}

const GeminiContext = createContext<GeminiContextType | null>(null);

const ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export function GeminiProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('gemini_api_key') || ENV_KEY);
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    (localStorage.getItem('gemini_api_key') || ENV_KEY) ? 'connected' : 'not_configured'
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
    setConnectionError(null);
    const { ok, error } = await testGeminiConnection(apiKey);
    setStatus(ok ? 'connected' : 'invalid');
    if (ok) {
      localStorage.setItem('gemini_api_key', apiKey);
    } else {
      setConnectionError(error || 'Unknown error');
    }
  }, [apiKey]);

  return (
    <GeminiContext.Provider value={{
      apiKey,
      status,
      connectionError,
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

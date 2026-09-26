import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppSettings } from '../models/types';
import { DEFAULT_SETTINGS } from '../models/constants';
import { settingsRepository } from '../storage/settingsRepository';

interface SettingsCtx {
  settings: AppSettings;
  loaded: boolean;
  updateSettings: (fn: (s: AppSettings) => AppSettings) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(settings);

  useEffect(() => {
    settingsRepository.get().then((s) => {
      ref.current = s;
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback((fn: (s: AppSettings) => AppSettings) => {
    const next = fn(ref.current);
    ref.current = next;
    setSettings(next);
    void settingsRepository.save(next);
  }, []);

  return <Ctx.Provider value={{ settings, loaded, updateSettings }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings must be used inside SettingsProvider');
  return c;
}

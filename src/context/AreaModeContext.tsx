import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_AREA_MODE, type AreaMode } from '../logic/areaMode';
import { areaModeRepository } from '../storage/areaModeRepository';

interface Ctx { areaMode: AreaMode; setAreaMode: (m: AreaMode) => void }
const AreaCtx = createContext<Ctx | null>(null);

/** ترجیح «نحوه نمایش متراژ» (ستون / خط جدا) */
export function AreaModeProvider({ children }: { children: ReactNode }) {
  const [areaMode, setState] = useState<AreaMode>(DEFAULT_AREA_MODE);
  useEffect(() => {
    let alive = true;
    areaModeRepository.get().then((m) => { if (alive) setState(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const setAreaMode = useCallback((m: AreaMode) => {
    setState(m);
    void areaModeRepository.save(m).catch(() => undefined);
  }, []);
  return <AreaCtx.Provider value={{ areaMode, setAreaMode }}>{children}</AreaCtx.Provider>;
}

export function useAreaMode(): Ctx {
  const c = useContext(AreaCtx);
  if (!c) throw new Error('useAreaMode must be used inside AreaModeProvider');
  return c;
}

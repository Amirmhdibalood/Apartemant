import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_AREA_ICON, DEFAULT_UNIT_ICON, type AreaIconId, type UnitIconId } from '../logic/iconPrefs';
import { iconPrefsRepository } from '../storage/iconPrefsRepository';

interface Ctx { unitIcon: UnitIconId; areaIcon: AreaIconId; setUnitIcon: (i: UnitIconId) => void; setAreaIcon: (i: AreaIconId) => void }
const FALLBACK: Ctx = { unitIcon: DEFAULT_UNIT_ICON, areaIcon: DEFAULT_AREA_ICON, setUnitIcon: () => undefined, setAreaIcon: () => undefined };
const IconCtx = createContext<Ctx | null>(null);

/** ترجیح «نماد واحد» و «نماد متراژ» */
export function IconPrefsProvider({ children }: { children: ReactNode }) {
  const [unitIcon, setUnit] = useState<UnitIconId>(DEFAULT_UNIT_ICON);
  const [areaIcon, setArea] = useState<AreaIconId>(DEFAULT_AREA_ICON);
  useEffect(() => {
    let alive = true;
    iconPrefsRepository.getUnitIcon().then((v) => { if (alive) setUnit(v); }).catch(() => undefined);
    iconPrefsRepository.getAreaIcon().then((v) => { if (alive) setArea(v); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const setUnitIcon = useCallback((i: UnitIconId) => { setUnit(i); void iconPrefsRepository.saveUnitIcon(i).catch(() => undefined); }, []);
  const setAreaIcon = useCallback((i: AreaIconId) => { setArea(i); void iconPrefsRepository.saveAreaIcon(i).catch(() => undefined); }, []);
  return <IconCtx.Provider value={{ unitIcon, areaIcon, setUnitIcon, setAreaIcon }}>{children}</IconCtx.Provider>;
}

/** بدون Provider (مثلاً در تست‌ها) مقدارهای پیش‌فرض برمی‌گردد */
export function useIconPrefs(): Ctx {
  return useContext(IconCtx) ?? FALLBACK;
}

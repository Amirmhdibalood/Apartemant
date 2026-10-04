import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_REPORT_PREFS, setReportVisible, type ReportPrefs } from '../logic/reportPrefs';
import type { ReportId } from '../logic/reportCatalog';
import { reportPrefsRepository } from '../storage/reportPrefsRepository';

interface Ctx {
  prefs: ReportPrefs;
  setReportOn: (id: ReportId, on: boolean) => void;
}
const FALLBACK: Ctx = { prefs: DEFAULT_REPORT_PREFS, setReportOn: () => undefined };
const ReportPrefsCtx = createContext<Ctx | null>(null);

/** گزارش‌های نمایش‌داده‌شده در فهرست گزارش‌ها (تنظیمات ← نمایش گزارش‌ها) */
export function ReportPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ReportPrefs>(DEFAULT_REPORT_PREFS);
  const ref = useRef(prefs);
  ref.current = prefs;
  useEffect(() => {
    let alive = true;
    reportPrefsRepository.get().then((p) => { if (alive) setPrefs(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const setReportOn = useCallback((id: ReportId, on: boolean) => {
    const next = setReportVisible(ref.current, id, on);
    ref.current = next;
    setPrefs(next);
    void reportPrefsRepository.save(next).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ prefs, setReportOn }), [prefs, setReportOn]);
  return <ReportPrefsCtx.Provider value={value}>{children}</ReportPrefsCtx.Provider>;
}

/** بدون Provider (مثلاً در تست‌ها) همه روشن است */
export function useReportPrefs(): Ctx {
  return useContext(ReportPrefsCtx) ?? FALLBACK;
}

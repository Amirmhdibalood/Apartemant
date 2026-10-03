import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BillWithUnits, ExpenseType, SplitMethod } from '../models/types';
import { DEFAULT_ENTRY_PREFS, setMethodEnabled, setTypeEnabled, visibleBills, type EntryPrefs } from '../logic/entryPrefs';
import { entryPrefsRepository } from '../storage/entryPrefsRepository';

interface Ctx {
  prefs: EntryPrefs;
  setTypeOn: (t: ExpenseType, on: boolean) => void;
  setMethodOn: (m: SplitMethod, on: boolean) => void;
}
const FALLBACK: Ctx = { prefs: DEFAULT_ENTRY_PREFS, setTypeOn: () => undefined, setMethodOn: () => undefined };
const EntryCtx = createContext<Ctx | null>(null);

/** انواع قبض و روش‌های محاسبه فعال (تنظیمات) */
export function EntryPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<EntryPrefs>(DEFAULT_ENTRY_PREFS);
  const ref = useRef(prefs);
  ref.current = prefs;
  useEffect(() => {
    let alive = true;
    entryPrefsRepository.get().then((p) => { if (alive) setPrefs(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const commit = useCallback((p: EntryPrefs) => {
    ref.current = p;
    setPrefs(p);
    void entryPrefsRepository.save(p).catch(() => undefined);
  }, []);
  const setTypeOn = useCallback((t: ExpenseType, on: boolean) => commit(setTypeEnabled(ref.current, t, on)), [commit]);
  const setMethodOn = useCallback((m: SplitMethod, on: boolean) => commit(setMethodEnabled(ref.current, m, on)), [commit]);
  const value = useMemo(() => ({ prefs, setTypeOn, setMethodOn }), [prefs, setTypeOn, setMethodOn]);
  return <EntryCtx.Provider value={value}>{children}</EntryCtx.Provider>;
}

/** بدون Provider (مثلاً در تست‌ها) همه فعال است */
export function useEntryPrefs(): Ctx {
  return useContext(EntryCtx) ?? FALLBACK;
}

/** قبض‌های نوع فعال (null می‌ماند null) */
export function useVisibleBills(all: BillWithUnits[] | null): BillWithUnits[] | null {
  const { prefs } = useEntryPrefs();
  return useMemo(() => (all ? visibleBills(all, prefs) : all), [all, prefs]);
}

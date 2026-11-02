import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BillWithUnits, ExpenseType, SplitMethod } from '../models/types';
import { isCustomTypeId, isExpenseType } from '../models/constants';
import { DEFAULT_ENTRY_PREFS, setMethodEnabled, setTypeEnabled, visibleBills, withCustomTypes, type EntryPrefs } from '../logic/entryPrefs';
import { customTypesOf, onCustomTypesChange, type CustomBillType } from '../logic/billTypes';
import { entryPrefsRepository } from '../storage/entryPrefsRepository';
import { billTypeRepository } from '../storage/billTypeRepository';
import { buildingRepository } from '../storage/buildingRepository';
import { DEFAULT_BUILDING_ID } from '../storage/sqlite/schema';

interface Ctx {
  /**
   * انواع و روش‌های فعال برای ساختمان انتخاب‌شده: `types` = نوع‌های داخلیِ روشن (ترجیح همین گوشی)
   * + نوع‌های سفارشیِ روشنِ همین ساختمان (به ترتیب خودشان).
   */
  prefs: EntryPrefs;
  /** فقط ترجیح ذخیره‌شدهٔ گوشی (۸ نوع داخلی) — برای قانون «دست‌کم یک نوع داخلی روشن» */
  builtinPrefs: EntryPrefs;
  /** نوع‌های سفارشی ساختمان انتخاب‌شده (خاموش‌ها هم) */
  customTypes: CustomBillType[];
  buildingId: string;
  setTypeOn: (t: ExpenseType, on: boolean) => void;
  setMethodOn: (m: SplitMethod, on: boolean) => void;
}
const FALLBACK: Ctx = {
  prefs: DEFAULT_ENTRY_PREFS, builtinPrefs: DEFAULT_ENTRY_PREFS, customTypes: [], buildingId: DEFAULT_BUILDING_ID,
  setTypeOn: () => undefined, setMethodOn: () => undefined,
};
const EntryCtx = createContext<Ctx | null>(null);

/** انواع قبض و روش‌های محاسبه فعال (تنظیمات) + نوع‌های سفارشی ساختمان انتخاب‌شده */
export function EntryPrefsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<EntryPrefs>(DEFAULT_ENTRY_PREFS);
  const ref = useRef(stored);
  ref.current = stored;
  const [buildingId, setBuildingId] = useState(DEFAULT_BUILDING_ID);
  const [regVersion, setRegVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    entryPrefsRepository.get().then((p) => { if (alive) setStored(p); }).catch(() => undefined);
    const loadActive = () => { buildingRepository.getActiveId().then((id) => { if (alive) setBuildingId(id); }).catch(() => undefined); };
    loadActive();
    void billTypeRepository.refresh().catch(() => undefined);
    const offReg = onCustomTypesChange(() => { if (alive) setRegVersion((v) => v + 1); });
    const offActive = buildingRepository.onActiveChange(loadActive);
    return () => { alive = false; offReg(); offActive(); };
  }, []);
  const commit = useCallback((p: EntryPrefs) => {
    ref.current = p;
    setStored(p);
    void entryPrefsRepository.save(p).catch(() => undefined);
  }, []);
  const setTypeOn = useCallback((t: ExpenseType, on: boolean) => {
    if (isExpenseType(t)) commit(setTypeEnabled(ref.current, t, on));
    else if (isCustomTypeId(t)) void billTypeRepository.setHidden(t, !on).catch(() => undefined);
  }, [commit]);
  const setMethodOn = useCallback((m: SplitMethod, on: boolean) => commit(setMethodEnabled(ref.current, m, on)), [commit]);
  const customTypes = useMemo(() => (regVersion >= 0 ? customTypesOf(buildingId) : []), [buildingId, regVersion]);
  const prefs = useMemo(() => withCustomTypes(stored, customTypes), [stored, customTypes]);
  const value = useMemo(
    () => ({ prefs, builtinPrefs: stored, customTypes, buildingId, setTypeOn, setMethodOn }),
    [prefs, stored, customTypes, buildingId, setTypeOn, setMethodOn],
  );
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

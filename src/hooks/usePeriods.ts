import { useCallback, useEffect, useState } from 'react';
import { periodsRepository, type PeriodsState, type ShowHiddenPrefs } from '../storage/periodsRepository';
import { billRepository } from '../storage/billRepository';
import { buildingRepository } from '../storage/buildingRepository';
import { openYears } from '../logic/periods';

export interface UsePeriods {
  state: PeriodsState | null;
  show: ShowHiddenPrefs;
  /** سال‌های فیلترها و گزارش‌ها (پنهان‌ها فقط با «نمایش سال‌های پنهان») — صعودی */
  visibleYears: number[];
  /** سال‌های باز (قابل انتخاب در فرم قبض) — صعودی */
  openYears: number[];
  reload: () => void;
}

/** سال‌ها/دوره‌های ساختمان فعال؛ با تغییر دوره‌ها، قبض‌ها یا ساختمان فعال تازه می‌شود */
export function usePeriods(): UsePeriods {
  const [state, setState] = useState<PeriodsState | null>(null);
  const [show, setShow] = useState<ShowHiddenPrefs>({ years: false, managers: false });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    void Promise.all([periodsRepository.getState(), periodsRepository.getShowHidden()])
      .then(([s, sh]) => { if (alive) { setState(s); setShow(sh); } })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    const offs = [periodsRepository.onChange(reload), billRepository.onChange(reload), buildingRepository.onActiveChange(reload)];
    return () => { offs.forEach((o) => o()); };
  }, [reload]);

  const visibleYears = state ? state.years.filter((y) => show.years || !y.hidden).map((y) => y.year).sort((a, b) => a - b) : [];
  return { state, show, visibleYears, openYears: state ? openYears(state.years) : [], reload };
}

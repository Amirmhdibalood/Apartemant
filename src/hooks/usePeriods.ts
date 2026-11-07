import { useCallback, useEffect, useState } from 'react';
import { periodsRepository, type PeriodsState, type ShowHiddenPrefs } from '../storage/periodsRepository';
import { billRepository } from '../storage/billRepository';
import { buildingRepository } from '../storage/buildingRepository';
import { selectableBillYears, visibleYears as visibleOf } from '../logic/periods';

export interface UsePeriods {
  state: PeriodsState | null;
  show: ShowHiddenPrefs;
  /** سال‌های فیلترها و گزارش‌ها (سال پنهان نه) — صعودی */
  visibleYears: number[];
  /** سال‌های قابل انتخاب در فرم قبض (پنهان‌ها هم) — صعودی */
  billYears: number[];
  /** سال‌های پنهان ساختمان فعال */
  hiddenYears: number[];
  reload: () => void;
}

/** سال‌ها/دوره‌های ساختمان فعال؛ با تغییر دوره‌ها، قبض‌ها یا ساختمان فعال تازه می‌شود */
export function usePeriods(): UsePeriods {
  const [state, setState] = useState<PeriodsState | null>(null);
  const [show, setShow] = useState<ShowHiddenPrefs>({ managers: false });
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

  return {
    state,
    show,
    visibleYears: state ? visibleOf(state.years) : [],
    billYears: state ? selectableBillYears(state.years) : [],
    hiddenYears: state ? state.years.filter((y) => y.hidden).map((y) => y.year) : [],
    reload,
  };
}

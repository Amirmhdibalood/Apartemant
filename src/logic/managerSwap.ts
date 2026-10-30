/**
 * تعریف مدیر جدید وقتی ساختمان مدیر فعال دارد: اول تأیید کاربر، بعد ثبت.
 * منطق بستن دوره‌ها همان مسیر قبلی `addManagementPeriod(endPreviousEarly)` است و اینجا تغییری نمی‌کند.
 */
import type { ManagementPeriodRow } from '../storage/sqlite/domain';
import { isOpenManagementPeriod } from './billGate';

export interface NewManagerInput {
  managerLabel: string;
  startDate: string;
  endDate: string;
}

/** آنچه دیالوگ تأیید نشان می‌دهد */
export interface ManagerSwapPlan {
  current: ManagementPeriodRow;
  /** تاریخ بستن دورهٔ فعلی (کلید شمسی امروز) */
  closeDate: string;
  newLabel: string;
  newStart: string;
}

/** دورهٔ مدیریتی که امروز باز است (اگر باشد) */
export function findOpenPeriod(periods: ManagementPeriodRow[], todayKey: string): ManagementPeriodRow | null {
  return periods.find((p) => isOpenManagementPeriod(p, todayKey)) ?? null;
}

/** اگر دورهٔ باز هست، اطلاعات دیالوگ؛ وگرنه null (ثبت مستقیم بدون پرسش) */
export function planManagerSwap(periods: ManagementPeriodRow[], todayKey: string, input: NewManagerInput): ManagerSwapPlan | null {
  const current = findOpenPeriod(periods, todayKey);
  if (!current) return null;
  return { current, closeDate: todayKey, newLabel: input.managerLabel, newStart: input.startDate };
}

export type SubmitManagerResult = 'saved' | 'cancelled';

/** جریان کامل ثبت: پرسش فقط وقتی دورهٔ باز هست؛ انصراف = هیچ ذخیره‌ای */
export async function submitNewManager(
  input: NewManagerInput,
  deps: {
    periods: ManagementPeriodRow[];
    todayKey: string;
    confirm: (plan: ManagerSwapPlan) => Promise<boolean>;
    save: (input: NewManagerInput) => Promise<unknown>;
  },
): Promise<SubmitManagerResult> {
  const plan = planManagerSwap(deps.periods, deps.todayKey, input);
  if (plan && !(await deps.confirm(plan))) return 'cancelled';
  await deps.save(input);
  return 'saved';
}

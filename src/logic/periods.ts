/**
 * سال‌ها و دوره‌های مدیریت هر ساختمان (از ۱.۹ / شِمای ۸).
 *
 * - هر سال از ۱ فروردین تا آخرین روز اسفند (۲۹ یا ۳۰) است؛ «بستن سال» برگشت ندارد.
 * - دورهٔ مدیریت: مدیر از واحدها (با نام نمایشی اختیاری)، شروع و پایان (پایان می‌تواند خالی = بدون پایان باشد).
 *   دورهٔ بسته (زودتر بسته شده یا تاریخ پایانش گذشته) دوباره باز نمی‌شود.
 * - قبض قفل است اگر سالش بسته باشد یا دورهٔ مدیریتی که به آن وصل است بسته باشد.
 *   قفل یعنی ویرایش، حذف، تیک «پرداخت شد» و تغییر مهلت ممکن نیست؛ پرداخت واحدها همچنان ثبت می‌شود.
 */
import { jalaliIsoDate } from './date';
import { toPersianDigits } from './formatting';
import { addJalaliDays, formatJalaliKey, jalaliMonthLength, parseJalaliKey } from './jalali';

/* ─── سال‌ها ─── */

export interface BuildingYear {
  year: number;
  /** ISO زمان بستن سال؛ null = باز */
  closedAt: string | null;
  /** پنهان از فهرست‌ها و فیلترها (فقط سال بسته) */
  hidden: boolean;
}

/** شروع سال: ۱ فروردین */
export function yearStartKey(year: number): string {
  return `${year}-01-01`;
}

/** پایان سال: آخرین روز اسفند (۲۹ یا ۳۰ در سال کبیسه) */
export function yearEndKey(year: number): string {
  return `${year}-12-${String(jalaliMonthLength(year, 12)).padStart(2, '0')}`;
}

/** «۱۴۰۵/۰۱/۰۱» از کلید "1405-01-01" */
export function keyToSlash(key: string): string {
  return toPersianDigits(key.replace(/-/g, '/'));
}

/** دو خط کارت سال: «تاریخ شروع: ۱۴۰۵/۰۱/۰۱» و «تاریخ پایان: ۱۴۰۵/۱۲/۲۹» (۳۰ در سال کبیسه) */
export function yearRangeLines(year: number): { start: string; end: string } {
  return { start: `تاریخ شروع: ${keyToSlash(yearStartKey(year))}`, end: `تاریخ پایان: ${keyToSlash(yearEndKey(year))}` };
}

/** پایان سال گذشته و هنوز بسته نشده → پیشنهاد «بستن سال» */
export function yearShouldBeClosed(y: BuildingYear, todayKey: string): boolean {
  return !y.closedAt && yearEndKey(y.year) < todayKey;
}

export function closedYearSet(years: readonly BuildingYear[]): Set<number> {
  return new Set(years.filter((y) => y.closedAt).map((y) => y.year));
}

export function openYears(years: readonly BuildingYear[]): number[] {
  return years.filter((y) => !y.closedAt).map((y) => y.year).sort((a, b) => a - b);
}

/** سال‌هایی که در فیلترها/گزارش‌ها دیده می‌شوند (پنهان‌ها فقط وقتی «نمایش سال‌های پنهان» روشن است) */
export function visibleYears(years: readonly BuildingYear[], showHidden: boolean): number[] {
  return years.filter((y) => showHidden || !y.hidden).map((y) => y.year).sort((a, b) => a - b);
}

/** سال پیش‌فرض فرم قبض: سال پیش‌فرض (اگر باز)، وگرنه امسال (اگر باز)، وگرنه نزدیک‌ترین سال باز */
export function defaultBillYear(years: readonly BuildingYear[], defaultYear: number | null, currentYear: number): number | null {
  const open = openYears(years);
  if (open.length === 0) return null;
  if (defaultYear != null && open.includes(defaultYear)) return defaultYear;
  if (open.includes(currentYear)) return currentYear;
  return [...open].sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear) || b - a)[0];
}

/**
 * فهرست سال‌های ساختمان = ردیف‌های ذخیره‌شده ∪ سال‌های دارای قبض (باز، نمایان).
 * مرتب نزولی (جدیدترین بالا).
 */
export function mergeBuildingYears(rows: readonly BuildingYear[], billYears: Iterable<number>): BuildingYear[] {
  const map = new Map<number, BuildingYear>();
  for (const r of rows) map.set(r.year, { ...r, hidden: !!r.closedAt && r.hidden });
  for (const y of billYears) if (!map.has(y)) map.set(y, { year: y, closedAt: null, hidden: false });
  return [...map.values()].sort((a, b) => b.year - a.year);
}

/* ─── دوره‌های مدیریت ─── */

export interface MgmtPeriod {
  id: string;
  buildingId: string;
  /** نام نمایشی (اختیاری؛ نام آزاد قدیمی اینجا منتقل شده) */
  managerLabel: string;
  /** شمارهٔ واحد مدیر؛ null = انتخاب نشده (دوره‌های قدیمی) */
  managerUnit: number | null;
  startDate: string;
  /** '' = بدون تاریخ پایان */
  endDate: string;
  endedEarlyAt: string | null;
  notes: string | null;
  hidden: boolean;
}

export function isoToJalaliKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return jalaliIsoDate(d);
}

export function dayBefore(key: string): string {
  const d = parseJalaliKey(key);
  return d ? formatJalaliKey(addJalaliDays(d, -1)) : key;
}

export function hasOpenEnd(p: Pick<MgmtPeriod, 'endDate'>): boolean {
  return !parseJalaliKey(p.endDate);
}

/** آخرین روز پوشش دوره (شامل)؛ null = بدون پایان */
export function effectiveEnd(p: Pick<MgmtPeriod, 'endDate' | 'endedEarlyAt'>): string | null {
  const end = parseJalaliKey(p.endDate) ? p.endDate : null;
  const early = isoToJalaliKey(p.endedEarlyAt);
  if (early && (!end || early < end)) return early;
  return end;
}

/** دورهٔ بسته: زودتر بسته شده یا تاریخ پایانش گذشته (برگشت ندارد) */
export function isPeriodClosed(p: Pick<MgmtPeriod, 'endDate' | 'endedEarlyAt'>, todayKey: string): boolean {
  if (p.endedEarlyAt) return true;
  const end = effectiveEnd(p);
  return !!end && end < todayKey;
}

/** دورهٔ فعال امروز: بسته نیست و شروعش رسیده */
export function isPeriodActive(p: Pick<MgmtPeriod, 'startDate' | 'endDate' | 'endedEarlyAt'>, todayKey: string): boolean {
  return !isPeriodClosed(p, todayKey) && p.startDate <= todayKey;
}

function covers(p: MgmtPeriod, dateKey: string, atIso?: string | null): boolean {
  if (p.startDate > dateKey) return false;
  const end = effectiveEnd(p);
  if (end && end < dateKey) return false;
  if (p.endedEarlyAt && atIso && atIso > p.endedEarlyAt) return false;
  return true;
}

/** دوره‌ای که تاریخ (و زمان ثبت) را پوشش می‌دهد؛ هم‌پوشانی → جدیدترین شروع */
export function periodForDate(periods: readonly MgmtPeriod[], dateKey: string, atIso?: string | null): MgmtPeriod | null {
  let best: MgmtPeriod | null = null;
  for (const p of periods) {
    if (!covers(p, dateKey, atIso)) continue;
    if (!best || p.startDate > best.startDate || (p.startDate === best.startDate && p.id > best.id)) best = p;
  }
  return best;
}

/** دورهٔ قبضی که در زمان `createdAtIso` ثبت شده (همان قاعدهٔ مهاجرت قبض‌های قدیمی) */
export function periodForCreatedAt(periods: readonly MgmtPeriod[], createdAtIso: string): MgmtPeriod | null {
  const key = isoToJalaliKey(createdAtIso);
  return key ? periodForDate(periods, key, createdAtIso) : null;
}

/** مدیر فعال امروز (تیک خودکار) */
export function activePeriod(periods: readonly MgmtPeriod[], todayKey: string, nowIso?: string): MgmtPeriod | null {
  const p = periodForDate(periods.filter((x) => isPeriodActive(x, todayKey)), todayKey, nowIso);
  return p;
}

export function managerDisplayName(p: Pick<MgmtPeriod, 'managerLabel' | 'managerUnit'>): string {
  const alias = p.managerLabel.trim();
  if (alias) return alias;
  return p.managerUnit != null ? `واحد ${toPersianDigits(p.managerUnit)}` : 'مدیر';
}

export type NewPeriodPlan =
  | { ok: true; closes: Array<{ id: string; name: string; endDate: string }> }
  | { ok: false; error: string };

/**
 * ثبت دورهٔ جدید از `startDate`: دورهٔ بازِ قبلی که هم‌پوشانی دارد، روز قبل از شروع جدید بسته می‌شود
 * (بعد از تأیید کاربر). هم‌پوشانی با دورهٔ بسته یا شروعِ قبل از دورهٔ باز = خطا.
 */
export function planNewPeriod(
  periods: readonly MgmtPeriod[],
  input: { startDate: string; endDate: string | null; managerUnit: number | null },
  todayKey: string,
): NewPeriodPlan {
  if (input.managerUnit == null) return { ok: false, error: 'مدیر را از واحدها انتخاب کنید.' };
  if (!parseJalaliKey(input.startDate)) return { ok: false, error: 'تاریخ شروع را انتخاب کنید.' };
  const end = input.endDate && parseJalaliKey(input.endDate) ? input.endDate : null;
  if (end && end < input.startDate) return { ok: false, error: 'تاریخ پایان باید بعد از تاریخ شروع باشد.' };
  const closes: Array<{ id: string; name: string; endDate: string }> = [];
  for (const p of periods) {
    const pEnd = effectiveEnd(p);
    const overlap = p.startDate <= (end ?? '9999-99-99') && (pEnd ?? '9999-99-99') >= input.startDate;
    if (!overlap) continue;
    const name = managerDisplayName(p);
    if (isPeriodClosed(p, todayKey)) {
      return { ok: false, error: `این تاریخ با دورهٔ بسته‌شدهٔ «${name}» هم‌پوشانی دارد. تاریخ شروع را بعد از پایان آن دوره بگذارید.` };
    }
    if (p.startDate >= input.startDate) {
      return { ok: false, error: `تاریخ شروع باید بعد از شروع دورهٔ «${name}» باشد.` };
    }
    closes.push({ id: p.id, name, endDate: dayBefore(input.startDate) });
  }
  return { ok: true, closes };
}

/** ویرایش دورهٔ باز: فقط مدیر، نام نمایشی و تاریخ پایان (نه کوتاه‌تر از امروز و بدون هم‌پوشانی با دورهٔ بعدی) */
export function validatePeriodEdit(
  periods: readonly MgmtPeriod[],
  target: MgmtPeriod,
  input: { endDate: string | null; managerUnit: number | null },
  todayKey: string,
): string | null {
  if (isPeriodClosed(target, todayKey)) return 'دورهٔ بسته قابل ویرایش نیست.';
  if (input.managerUnit == null) return 'مدیر را از واحدها انتخاب کنید.';
  const end = input.endDate && parseJalaliKey(input.endDate) ? input.endDate : null;
  if (end && end < target.startDate) return 'تاریخ پایان باید بعد از تاریخ شروع باشد.';
  if (end && end < todayKey) return 'تاریخ پایان نمی‌تواند قبل از امروز باشد؛ برای پایان دادن «بستن دوره» را بزنید.';
  for (const p of periods) {
    if (p.id === target.id || p.startDate <= target.startDate) continue;
    if (!end || end >= p.startDate) return `تاریخ پایان باید قبل از شروع دورهٔ «${managerDisplayName(p)}» باشد.`;
  }
  return null;
}

/* ─── قفل قبض ─── */

export type LockReason = 'year' | 'manager';

export interface BillLock {
  locked: boolean;
  reason: LockReason | null;
  /** دورهٔ مدیریتِ قبض (اگر وصل باشد) */
  period: MgmtPeriod | null;
}

export interface LockContext {
  closedYears: ReadonlySet<number>;
  periods: readonly MgmtPeriod[];
  todayKey: string;
}

export function billLockState(bill: { year: number; mgmtPeriodId?: string | null }, ctx: LockContext): BillLock {
  const period = bill.mgmtPeriodId ? ctx.periods.find((p) => p.id === bill.mgmtPeriodId) ?? null : null;
  if (ctx.closedYears.has(bill.year)) return { locked: true, reason: 'year', period };
  if (period && isPeriodClosed(period, ctx.todayKey)) return { locked: true, reason: 'manager', period };
  return { locked: false, reason: null, period };
}

export const UNLOCKED: BillLock = { locked: false, reason: null, period: null };

export function lockMessage(lock: BillLock, year: number): string {
  if (lock.reason === 'year') {
    return `سال ${toPersianDigits(year)} بسته شده است؛ این قبض دیگر قابل ویرایش، حذف یا تغییر وضعیت نیست. ثبت پرداخت واحدها همچنان ممکن است.`;
  }
  if (lock.reason === 'manager' && lock.period) {
    return `دورهٔ مدیریت «${managerDisplayName(lock.period)}» بسته شده است؛ این قبض دیگر قابل ویرایش، حذف یا تغییر وضعیت نیست. ثبت پرداخت واحدها همچنان ممکن است.`;
  }
  return '';
}

export function lockShortLabel(lock: BillLock, year: number): string {
  if (lock.reason === 'year') return `سال ${toPersianDigits(year)} بسته است`;
  if (lock.reason === 'manager' && lock.period) return `دورهٔ ${managerDisplayName(lock.period)} بسته است`;
  return '';
}

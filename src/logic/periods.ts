/**
 * سال‌ها و دوره‌های مدیریت هر ساختمان (از ۱.۹ / شِمای ۸).
 *
 * - هر سال از ۱ فروردین تا آخرین روز اسفند (۲۹ یا ۳۰) است و خودکار ساخته می‌شود؛ فقط پنهان/نمایش دارد.
 * - دورهٔ مدیریت: مدیر از واحدها (با نام نمایشی اختیاری)، شروع و پایان (پایان می‌تواند خالی = بدون پایان باشد).
 *   دورهٔ بسته (زودتر بسته شده یا تاریخ پایانش گذشته) دوباره باز نمی‌شود.
 * - قبض فقط وقتی قفل است که دورهٔ مدیریتی که به آن وصل است بسته باشد (سال قفل نمی‌کند).
 *   قفل یعنی ویرایش، حذف، تیک «پرداخت شد» و تغییر مهلت ممکن نیست؛ پرداخت واحدها همچنان ثبت می‌شود.
 */
import { jalaliIsoDate } from './date';
import { toPersianDigits } from './formatting';
import { addJalaliDays, formatJalaliKey, jalaliMonthLength, parseJalaliKey } from './jalali';

/* ─── سال‌ها ─── */

/**
 * سال‌های هر ساختمان (از ۱.۹.۲): خودکار. سال جاری همیشه هست (اول فروردین خودش ساخته و انتخاب می‌شود).
 * سال بعد قبل از رسیدن دیده/اضافه نمی‌شود. تنها کار روی هر سال «پنهان / نمایش» است.
 * سال بسته نمی‌شود و قبض را قفل نمی‌کند (قفل فقط از دورهٔ مدیریتِ بسته می‌آید).
 */
export interface BuildingYear {
  year: number;
  /** فقط برای سازگاری با پشتیبان ۱.۹.۰؛ از ۱.۹.۱ همیشه null است (بستن سال حذف شده) */
  closedAt: string | null;
  /** پنهان از فیلترهای سوابق و گزارش‌ها (فقط سال‌های گذشته) */
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

/** پیش‌فرض تاریخ‌های مدیر جدید: شروع = امروز، پایان = آخر اسفند همان سال */
export function defaultNewManagerDates(todayKey: string): { startDate: string; endDate: string } {
  const year = Number(todayKey.slice(0, 4));
  return { startDate: todayKey, endDate: yearEndKey(year) };
}

/** «۱۴۰۵/۰۱/۰۱» از کلید "1405-01-01" */
export function keyToSlash(key: string): string {
  return toPersianDigits(key.replace(/-/g, '/'));
}

/** دو خط کارت سال: «تاریخ شروع: ۱۴۰۵/۰۱/۰۱» و «تاریخ پایان: ۱۴۰۵/۱۲/۲۹» (۳۰ در سال کبیسه) */
export function yearRangeLines(year: number): { start: string; end: string } {
  return { start: `تاریخ شروع: ${keyToSlash(yearStartKey(year))}`, end: `تاریخ پایان: ${keyToSlash(yearEndKey(year))}` };
}

/** سال جاری پنهان نمی‌شود */
export function canHideYear(year: number, currentYear: number): boolean {
  return year < currentYear;
}

/** @deprecated از ۱.۹.۲ افزودن سال بعد حذف شد؛ همیشه null */
export function nextAddableYear(_years: readonly Pick<BuildingYear, 'year'>[], _currentYear: number): number | null {
  return null;
}

/** سال‌هایی که در فیلترهای سوابق و گزارش‌ها دیده می‌شوند (پنهان‌ها نه) — صعودی */
export function visibleYears(years: readonly BuildingYear[]): number[] {
  return years.filter((y) => !y.hidden).map((y) => y.year).sort((a, b) => a - b);
}

/** سال‌های قابل انتخاب در فرم قبض: پیش‌فرض فقط سال جاری؛ `extra` سال‌های مجازِ اضافه (مثلاً بعد از هشدار تاریخ). */
export function selectableBillYears(years: readonly BuildingYear[], currentYear?: number, extra: readonly number[] = []): number[] {
  if (currentYear == null && extra.length === 0) {
    // سازگاری با تست‌های ۱.۹.۱: همهٔ سال‌های فهرست
    return years.map((y) => y.year).sort((a, b) => a - b);
  }
  const cur = currentYear ?? Math.max(0, ...years.map((y) => y.year), 0);
  const set = new Set<number>([cur, ...extra]);
  return [...set].filter((y) => Number.isInteger(y) && y > 0).sort((a, b) => a - b);
}

/** اگر ماه انتخابی از ماه جاری جلوتر است، احتمالاً قبض مال سال قبل است (مثلاً اسفند در فروردین). */
export function impliedBillYear(draftYear: number, draftMonth: number, todayYear: number, todayMonth: number): number {
  if (draftYear === todayYear && draftMonth > todayMonth) return todayYear - 1;
  return draftYear;
}

/** سال قبض تازه: سال جاری (سال تاریخ امروز) */
export function defaultBillYear(currentYear: number): number {
  return currentYear;
}

/**
 * فهرست سال‌های ساختمان = سال‌های دارای قبض ∪ سال‌های ذخیره‌شده ∪ سال جاری،
 * از اولین سالِ دارای قبض (یا سال جاری) تا سال جاری؛ سال خالیِ آینده نمی‌آید.
 * سال جاری هیچ‌وقت پنهان نیست. مرتب نزولی (جدیدترین بالا).
 */
export function mergeBuildingYears(rows: readonly BuildingYear[], billYears: Iterable<number>, currentYear: number): BuildingYear[] {
  const withBills = new Set<number>(billYears);
  const first = withBills.size ? Math.min(currentYear, ...withBills) : currentYear;
  const map = new Map<number, BuildingYear>();
  for (const r of rows) {
    if (!withBills.has(r.year) && (r.year < first || r.year > currentYear)) continue;
    map.set(r.year, { year: r.year, closedAt: null, hidden: r.hidden && canHideYear(r.year, currentYear) });
  }
  for (const y of withBills) if (!map.has(y)) map.set(y, { year: y, closedAt: null, hidden: false });
  if (!map.has(currentYear)) map.set(currentYear, { year: currentYear, closedAt: null, hidden: false });
  return [...map.values()].sort((a, b) => b.year - a.year);
}

/** ردیف‌های ذخیره‌شده‌ای که باید پاک شوند: سال خالیِ قبل از اولین قبض/جاری، یا سال آیندهٔ بدون قبض */
export function staleYearRows(rows: readonly Pick<BuildingYear, 'year'>[], anyBillYears: ReadonlySet<number>, currentYear: number): number[] {
  return rows.filter((r) => !anyBillYears.has(r.year) && (r.year < currentYear || r.year > currentYear)).map((r) => r.year);
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

export type LockReason = 'manager';

export interface BillLock {
  locked: boolean;
  reason: LockReason | null;
  /** دورهٔ مدیریتِ قبض (اگر وصل باشد) */
  period: MgmtPeriod | null;
}

export interface LockContext {
  periods: readonly MgmtPeriod[];
  todayKey: string;
}

/** قفل قبض فقط از دورهٔ مدیریتِ بسته می‌آید */
export function billLockState(bill: { year: number; mgmtPeriodId?: string | null }, ctx: LockContext): BillLock {
  const period = bill.mgmtPeriodId ? ctx.periods.find((p) => p.id === bill.mgmtPeriodId) ?? null : null;
  if (period && isPeriodClosed(period, ctx.todayKey)) return { locked: true, reason: 'manager', period };
  return { locked: false, reason: null, period };
}

export const UNLOCKED: BillLock = { locked: false, reason: null, period: null };

export function lockMessage(lock: BillLock, year?: number): string {
  void year;
  if (lock.reason === 'manager' && lock.period) {
    return `دورهٔ مدیریت «${managerDisplayName(lock.period)}» بسته شده است؛ این قبض دیگر قابل ویرایش، حذف یا تغییر وضعیت نیست. ثبت پرداخت واحدها همچنان ممکن است.`;
  }
  return '';
}

export function lockShortLabel(lock: BillLock, year?: number): string {
  void year;
  if (lock.reason === 'manager' && lock.period) return `دورهٔ ${managerDisplayName(lock.period)} بسته است`;
  return '';
}

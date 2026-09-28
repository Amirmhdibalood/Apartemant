/**
 * تنظیمات «ساختمان» (از نسخه ۱.۶.۰) — منطق خالص و قابل تست.
 *
 * - تنظیمات ساختمان فقط «پیش‌فرض» فرم قبض جدید را پر می‌کند (تعداد واحدها، اسم مستعار و تعداد نفرات هر واحد).
 *   در فرم می‌توان مثل قبل واحد افزود/حذف کرد و نفرات را تغییر داد؛ این تغییرات فقط روی همان قبض اثر دارند.
 * - هر قبض یک «عکس لحظه‌ای» از واحدهایش (شماره، اسم مستعار، نفرات، سهم) ذخیره می‌کند؛
 *   تغییر تنظیمات ساختمان روی قبض‌ها، گزارش‌ها، بدهی‌ها و پرداخت‌های قبلی اثری ندارد.
 * - مهاجرت: در اولین اجرای نسخه ۱.۶.۰ تنظیمات از واحدهای جدیدترین قبض حذف‌نشده ساخته می‌شود
 *   (وگرنه الگوی واحدهای نسخه‌های قبلی، وگرنه ۱ واحد با ۱ نفر).
 */
import type { BillWithUnits, BuildingSettings, BuildingUnit } from '../models/types';
import { toPersianDigits } from './formatting';
import { remainingAmount } from './payments';
import { sanitizeUnitTemplate } from './unitTemplate';

export const MAX_BUILDING_UNITS = 500;
export const MAX_ALIAS_LENGTH = 40;
export const MAX_DEFAULT_PERSONS = 9999;
export const DEFAULT_UNIT_PERSONS = 1;

/** اسم مستعار تمیز: فاصله‌های اضافه حذف، حداکثر ۴۰ نویسه؛ خالی = null */
export function sanitizeAlias(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const clean = input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean === '') return null;
  return Array.from(clean).slice(0, MAX_ALIAS_LENGTH).join('').trim() || null;
}

/** برچسب نمایشی واحد: «واحد ۱» یا «واحد ۱ - آقای رضایی» */
export function unitLabel(unitNumber: number, alias?: string | null): string {
  const a = sanitizeAlias(alias);
  return `واحد ${toPersianDigits(unitNumber)}${a ? ` - ${a}` : ''}`;
}

/** برچسب کوتاه (بدون کلمه «واحد»): «۱» یا «۱ - آقای رضایی» */
export function unitShortLabel(unitNumber: number, alias?: string | null): string {
  const a = sanitizeAlias(alias);
  return `${toPersianDigits(unitNumber)}${a ? ` - ${a}` : ''}`;
}

export function newBuildingUnit(): BuildingUnit {
  return { alias: null, defaultPersons: DEFAULT_UNIT_PERSONS };
}

export function defaultBuilding(): BuildingSettings {
  return { units: [newBuildingUnit()] };
}

function sanitizePersons(input: unknown): number | null {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return null;
  return Math.min(input, MAX_DEFAULT_PERSONS);
}

/** اعتبارسنجی تنظیمات ساختمان (ذخیره‌شده یا داخل فایل پشتیبان)؛ نامعتبر = null */
export function sanitizeBuilding(input: unknown): BuildingSettings | null {
  if (!input || typeof input !== 'object') return null;
  const raw = (input as { units?: unknown }).units;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BUILDING_UNITS) return null;
  const units: BuildingUnit[] = [];
  for (const u of raw) {
    if (!u || typeof u !== 'object') return null;
    const persons = sanitizePersons((u as BuildingUnit).defaultPersons);
    if (persons === null) return null;
    const a = (u as BuildingUnit).alias;
    if (a != null && typeof a !== 'string') return null;
    units.push({ alias: sanitizeAlias(a), defaultPersons: persons });
  }
  return { units };
}

/** قبض‌های حذف‌نشده */
const active = (bills: BillWithUnits[]) => bills.filter((b) => !b.bill.deletedAt);

/**
 * ساخت تنظیمات ساختمان از روی جدیدترین قبض حذف‌نشده (بر اساس زمان ثبت)؛
 * وگرنه از الگوی واحدهای نسخه‌های قبلی؛ وگرنه ۱ واحد با ۱ نفر.
 */
export function buildingFromBills(bills: BillWithUnits[], legacyTemplate?: unknown): BuildingSettings {
  const list = active(bills).filter((b) => b.units.length > 0);
  if (list.length > 0) {
    const latest = list.reduce((a, b) => (b.bill.createdAt > a.bill.createdAt ? b : a));
    const units = [...latest.units]
      .sort((a, b) => a.unitNumber - b.unitNumber)
      .slice(0, MAX_BUILDING_UNITS)
      .map((u) => ({ alias: sanitizeAlias(u.alias), defaultPersons: sanitizePersons(u.personCount) ?? DEFAULT_UNIT_PERSONS }));
    return { units };
  }
  const t = sanitizeUnitTemplate(legacyTemplate);
  if (t) return { units: t.map((n) => ({ alias: null, defaultPersons: Math.min(n, MAX_DEFAULT_PERSONS) })) };
  return defaultBuilding();
}

/** تغییر تعداد واحدها (واحدهای جدید: بدون اسم، ۱ نفر؛ کاهش: حذف از آخر) */
export function resizeBuilding(b: BuildingSettings, count: number): BuildingSettings {
  const n = Math.max(1, Math.min(MAX_BUILDING_UNITS, Math.floor(count)));
  if (n <= b.units.length) return { units: b.units.slice(0, n) };
  return { units: [...b.units, ...Array.from({ length: n - b.units.length }, newBuildingUnit)] };
}

/** ردیف‌های فرم قبض جدید از روی تنظیمات ساختمان */
export function draftUnitsFromBuilding(b: BuildingSettings): { personCounts: string[]; unitAliases: (string | null)[] } {
  return {
    personCounts: b.units.map((u) => String(u.defaultPersons)),
    unitAliases: b.units.map((u) => u.alias),
  };
}

/** تنظیمات ساختمان از روی ردیف‌های فرم («ذخیره به‌عنوان پیش‌فرض»)؛ نفرات نامعتبر/خالی = ۱ */
export function buildingFromDraftUnits(personCounts: string[], unitAliases?: (string | null)[]): BuildingSettings | null {
  if (personCounts.length === 0 || personCounts.length > MAX_BUILDING_UNITS) return null;
  return {
    units: personCounts.map((raw, i) => {
      const t = (raw ?? '').trim();
      const n = /^\d+$/.test(t) ? Number(t) : DEFAULT_UNIT_PERSONS;
      return { alias: sanitizeAlias(unitAliases?.[i]), defaultPersons: Math.min(n, MAX_DEFAULT_PERSONS) };
    }),
  };
}

/** آیا ردیف‌های فرم با تنظیمات ساختمان یکسان‌اند؟ */
export function draftMatchesBuilding(personCounts: string[], unitAliases: (string | null)[] | undefined, b: BuildingSettings): boolean {
  if (personCounts.length !== b.units.length) return false;
  return b.units.every((u, i) => (personCounts[i] ?? '').trim() === String(u.defaultPersons) && sanitizeAlias(unitAliases?.[i]) === u.alias);
}

export interface RemovedUnitDebt {
  unitNumber: number;
  alias: string | null;
  amount: number;
}

/**
 * واحدهایی با شماره بزرگ‌تر از `newCount` که هنوز در قبض‌های حذف‌نشده بدهی دارند
 * (برای هشدار هنگام کم کردن تعداد واحدها؛ بدهی‌های قبلی در گزارش‌ها باقی می‌مانند).
 */
export function debtsBeyondUnitCount(bills: BillWithUnits[], newCount: number): RemovedUnitDebt[] {
  const map = new Map<number, RemovedUnitDebt>();
  const aliasAt = new Map<number, string>();
  for (const { bill, units } of [...active(bills)].sort((a, b) => a.bill.createdAt.localeCompare(b.bill.createdAt))) {
    void bill;
    for (const u of units) {
      if (u.unitNumber <= newCount) continue;
      if (u.alias !== undefined) aliasAt.set(u.unitNumber, sanitizeAlias(u.alias) ?? '');
      const rem = remainingAmount(u);
      if (rem <= 0) continue;
      const d = map.get(u.unitNumber) ?? { unitNumber: u.unitNumber, alias: null, amount: 0 };
      d.amount += rem;
      map.set(u.unitNumber, d);
    }
  }
  return [...map.values()]
    .map((d) => ({ ...d, alias: aliasAt.get(d.unitNumber) || null }))
    .sort((a, b) => a.unitNumber - b.unitNumber);
}

/**
 * اسم مستعار هر شماره واحد از جدیدترین قبض (حذف‌نشده) که آن واحد را دارد — برای گزارش‌ها
 * (بدهکاران، سابقه پرداخت). اسم‌ها از عکس لحظه‌ای قبض‌ها می‌آیند، نه از تنظیمات.
 */
export function latestAliases(bills: BillWithUnits[]): Map<number, string | null> {
  const out = new Map<number, string | null>();
  const sorted = [...active(bills)].sort((a, b) => a.bill.createdAt.localeCompare(b.bill.createdAt));
  for (const { units } of sorted) for (const u of units) out.set(u.unitNumber, sanitizeAlias(u.alias));
  return out;
}

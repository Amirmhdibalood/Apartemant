/**
 * نوع‌های قبض سفارشی (هر ساختمان جدا) + رجیستری یکپارچهٔ «نوع قبض» (۸ نوع داخلی + سفارشی‌ها).
 *
 * - شناسهٔ سفارشی تصادفی و یکتا در کل دستگاه است (c_xxxxxxxxxxxx)، پس برچسب/رنگ/نماد هر قبض از هر ساختمانی
 *   با همین شناسه پیدا می‌شود؛ فقط «فهرست‌ها» (فرم، فیلتر، گزارش، صندوق) به ساختمان فعال محدودند.
 * - قبض‌ها فقط شناسه را نگه می‌دارند → تغییر نام/رنگ/نماد روی همهٔ قبض‌های قبلی هم دیده می‌شود.
 * - روش تقسیم و همهٔ محاسبه‌ها برای نوع سفارشی دقیقاً مثل نوع‌های داخلی است (هیچ قانون محاسبه‌ای عوض نشده).
 */
import type { BuiltinExpenseType, CustomTypeId, ExpenseType } from '../models/types';
import { EXPENSE_TYPES, EXPENSE_TYPE_ORDER, isCustomTypeId, isExpenseType, type ExpenseTypeInfo } from '../models/constants';

export const MAX_CUSTOM_TYPES = 12;
export const TYPE_NAME_MIN = 2;
export const TYPE_NAME_MAX = 20;

/** ۱۲ نماد خطی که هیچ نوع داخلی از آن‌ها استفاده نمی‌کند (موکاپ ۱۰-b) */
export const CUSTOM_ICON_IDS = ['elevator', 'shield', 'leaf', 'trash', 'camera', 'key', 'parking', 'pool', 'fan', 'wifi', 'bell', 'bulb'] as const;
export type CustomIconId = (typeof CUSTOM_ICON_IDS)[number];
export const CUSTOM_ICON_LABELS: Record<CustomIconId, string> = {
  elevator: 'آسانسور', shield: 'نگهبانی', leaf: 'فضای سبز', trash: 'زباله', camera: 'دوربین', key: 'کلید',
  parking: 'پارکینگ', pool: 'استخر', fan: 'تهویه', wifi: 'اینترنت', bell: 'آیفون و زنگ', bulb: 'روشنایی',
};

/** ۸ رنگ تازه (متمایز از نوع‌های داخلی)؛ dark = رنگ اصلی در تم تاریک */
export const CUSTOM_COLORS = [
  { id: 'green', color: '#16A34A', dark: '#4ADE80' },
  { id: 'sky', color: '#0284C7', dark: '#38BDF8' },
  { id: 'indigo', color: '#4F46E5', dark: '#818CF8' },
  { id: 'brown', color: '#B45309', dark: '#F59E0B' },
  { id: 'fuchsia', color: '#C026D3', dark: '#E879F9' },
  { id: 'lime', color: '#65A30D', dark: '#A3E635' },
  { id: 'rose', color: '#E11D48', dark: '#FB7185' },
  { id: 'cyan', color: '#0E7490', dark: '#22D3EE' },
] as const;
export type CustomColorId = (typeof CUSTOM_COLORS)[number]['id'];

export const isCustomIconId = (v: unknown): v is CustomIconId => typeof v === 'string' && (CUSTOM_ICON_IDS as readonly string[]).includes(v);
export const isCustomColorId = (v: unknown): v is CustomColorId => typeof v === 'string' && CUSTOM_COLORS.some((c) => c.id === v);
export const customColor = (id: CustomColorId) => CUSTOM_COLORS.find((c) => c.id === id) ?? CUSTOM_COLORS[0];

export interface CustomBillType {
  id: CustomTypeId;
  buildingId: string;
  name: string;
  icon: CustomIconId;
  color: CustomColorId;
  /** ترتیب نمایش بعد از نوع‌های داخلی */
  sortOrder: number;
  /** خاموش در «انواع قبض و روش‌ها» (برخلاف نوع داخلی، روی خود ساختمان ذخیره می‌شود و در پشتیبان هست) */
  hidden: boolean;
  createdAt: string;
}

/* ─── نام: یکسان‌سازی و اعتبارسنجی ─── */

/** نام نمایشی: حروف عربی ← فارسی، بدون نویسه‌های کنترلی، فاصله‌های اضافه حذف */
export function cleanTypeName(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/\u200c{2,}/g, '\u200c')
    .trim();
}

/** کلید مقایسهٔ تکراری بودن: بدون فاصله و نیم‌فاصله و کشیده، حروف کوچک */
export function typeNameKey(raw: string): string {
  return cleanTypeName(raw).replace(/[\s\u200c\u0640]/g, '').toLowerCase();
}

const DIGITS_ONLY = /^[\d۰-۹٠-٩\s\u200c.,٫٬/-]+$/;

export interface CustomTypeDraft { name: string; icon: CustomIconId; color: CustomColorId }

/** خطای فارسی یا null. `others` = نوع‌های سفارشی همین ساختمان (به‌جز همانی که ویرایش می‌شود) */
export function validateCustomType(draft: CustomTypeDraft, others: readonly CustomBillType[], opts: { isNew: boolean }): string | null {
  const name = cleanTypeName(draft.name);
  if (name.length < TYPE_NAME_MIN) return `نام نوع قبض دست‌کم ${toFa(TYPE_NAME_MIN)} حرف باشد.`;
  if (name.length > TYPE_NAME_MAX) return `نام نوع قبض حداکثر ${toFa(TYPE_NAME_MAX)} حرف باشد.`;
  if (DIGITS_ONLY.test(name)) return 'نام نوع قبض نمی‌تواند فقط عدد باشد.';
  const key = typeNameKey(name);
  if (EXPENSE_TYPE_ORDER.some((t) => typeNameKey(EXPENSE_TYPES[t].label) === key)) return `«${name}» از نوع‌های اصلی برنامه است؛ نام دیگری انتخاب کنید.`;
  if (others.some((o) => typeNameKey(o.name) === key)) return `نوع «${name}» در این ساختمان از قبل هست.`;
  if (!isCustomIconId(draft.icon)) return 'یک نماد انتخاب کنید.';
  if (!isCustomColorId(draft.color)) return 'یک رنگ انتخاب کنید.';
  if (others.some((o) => o.icon === draft.icon && o.color === draft.color)) return 'همین نماد با همین رنگ برای نوع دیگری انتخاب شده؛ نماد یا رنگ را عوض کنید.';
  if (opts.isNew && others.length >= MAX_CUSTOM_TYPES) return `هر ساختمان حداکثر ${toFa(MAX_CUSTOM_TYPES)} نوع سفارشی می‌تواند داشته باشد.`;
  return null;
}

const toFa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function newCustomTypeId(): CustomTypeId {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += abc[b % abc.length];
  return `c_${s}`;
}

/** نخستین ترکیب نماد/رنگ آزاد (برای فرم افزودن) */
export function suggestIconColor(others: readonly CustomBillType[]): { icon: CustomIconId; color: CustomColorId } {
  for (let i = 0; i < CUSTOM_ICON_IDS.length * CUSTOM_COLORS.length; i++) {
    const icon = CUSTOM_ICON_IDS[i % CUSTOM_ICON_IDS.length];
    const color = CUSTOM_COLORS[(i + Math.floor(i / CUSTOM_ICON_IDS.length)) % CUSTOM_COLORS.length].id;
    if (!others.some((o) => o.icon === icon && o.color === color)) return { icon, color };
  }
  return { icon: 'elevator', color: 'green' };
}

/* ─── رجیستری (همهٔ ساختمان‌ها؛ از SQLite پر می‌شود) ─── */

let registry = new Map<string, CustomBillType>();
let version = 0;
const listeners = new Set<() => void>();

export function setCustomTypeRegistry(list: readonly CustomBillType[]): void {
  registry = new Map(list.map((t) => [t.id, t]));
  version++;
  for (const l of [...listeners]) l();
}
export const customTypeRegistryVersion = (): number => version;
export function onCustomTypesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const getCustomType = (id: unknown): CustomBillType | null => (typeof id === 'string' ? registry.get(id) ?? null : null);
export const allCustomTypes = (): CustomBillType[] => [...registry.values()];

const byOrder = (a: CustomBillType, b: CustomBillType) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** نوع‌های سفارشی یک ساختمان (خاموش‌ها هم؛ به ترتیب) */
export function customTypesOf(buildingId: string, list: readonly CustomBillType[] = allCustomTypes()): CustomBillType[] {
  return list.filter((t) => t.buildingId === buildingId).sort(byOrder);
}

/** آیا این شناسه برای این ساختمان معتبر است؟ (داخلی یا سفارشیِ همین ساختمان) */
export function isTypeOfBuilding(t: unknown, buildingId: string, list?: readonly CustomBillType[]): t is ExpenseType {
  if (isExpenseType(t)) return true;
  if (!isCustomTypeId(t)) return false;
  const c = list ? list.find((x) => x.id === t) : registry.get(t);
  return !!c && c.buildingId === buildingId;
}

/** شناسهٔ معتبر (داخلی یا سفارشی شناخته‌شده) یا «متفرقه» */
export function knownTypeOr(t: unknown, fallback: BuiltinExpenseType = 'misc'): ExpenseType {
  if (isExpenseType(t)) return t;
  if (isCustomTypeId(t) && registry.has(t)) return t;
  return fallback;
}

/* ─── اطلاعات نمایشی ─── */

export interface TypeInfo extends Omit<ExpenseTypeInfo, 'id'> {
  id: ExpenseType;
  custom: boolean;
  icon?: CustomIconId;
}

function mixHex(hex: string, withHex: string, ratio: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(withHex);
  return '#' + a.map((v, i) => Math.round(v * ratio + b[i] * (1 - ratio)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** برچسب، رنگ‌ها و نماد هر نوع؛ نوعِ ناشناخته = مثل «متفرقه» */
export function typeInfo(t: ExpenseType | string | null | undefined): TypeInfo {
  if (isExpenseType(t)) return { ...EXPENSE_TYPES[t], custom: false };
  const c = getCustomType(t);
  if (!c) return { ...EXPENSE_TYPES.misc, custom: false };
  const col = customColor(c.color);
  return {
    id: c.id, label: c.name, custom: true, icon: c.icon,
    color: col.color, bg: mixHex(col.color, '#FFFFFF', 0.08), iconBg: mixHex(col.color, '#FFFFFF', 0.18),
    dark: { color: col.dark, bg: mixHex(col.dark, '#151E33', 0.12), iconBg: mixHex(col.dark, '#151E33', 0.22) },
  };
}

export const typeLabel = (t: ExpenseType | string | null | undefined): string => typeInfo(t).label;

/** ترتیب سراسری: ۸ نوع داخلی، بعد سفارشی‌ها به ترتیب خودشان */
export function typeOrderIndex(t: ExpenseType | string): number {
  if (isExpenseType(t)) return EXPENSE_TYPE_ORDER.indexOf(t);
  const c = getCustomType(t);
  return c ? 100 + c.sortOrder : 10_000;
}

export const compareTypes = (a: ExpenseType | string, b: ExpenseType | string): number => typeOrderIndex(a) - typeOrderIndex(b) || String(a).localeCompare(String(b));

/** همهٔ نوع‌های یک ساختمان به ترتیب (داخلی + سفارشیِ همان ساختمان) */
export function buildingTypeOrder(buildingId: string, list?: readonly CustomBillType[]): ExpenseType[] {
  return [...EXPENSE_TYPE_ORDER, ...customTypesOf(buildingId, list).map((c) => c.id)];
}

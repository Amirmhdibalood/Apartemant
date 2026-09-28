/**
 * پشتیبان‌گیری و بازیابی — منطق خالص (بدون وابستگی به پلتفرم):
 * ساخت فایل پشتیبان JSON، نام‌گذاری، اعتبارسنجی کامل فایل ورودی و خلاصه محتوای آن.
 */
import type { AppSettings, Bill, ExpenseType, Payment, Unit } from '../models/types';
import { EXPENSE_TYPES } from '../models/constants';
import { sanitizeSettings } from './settings';
import { formatJalaliDateTimeFa, jalaliIsoDate } from './date';
import { toPersianDigits } from './formatting';
import { sanitizeUnitTemplate } from './unitTemplate';
import { isSplitMethod, sanitizeSplitDefaults, type SplitDefaults } from './split';
import { isBillDeleted, migrateBill, normalizePaidDate } from './billPaid';
import { parseJalaliKey } from './jalali';

export const BACKUP_APP_ID = 'apartemant';
/**
 * نسخه قالب فایل پشتیبان (با تغییر ساختار داده افزایش می‌یابد).
 * ۱: نسخه ۱٫۱ برنامه (قبض‌ها، واحدها، تنظیمات) — همچنان قابل بازیابی است.
 * ۲: نسخه ۱٫۲ برنامه (+ الگوی واحدها `unitTemplate` و پرداخت‌های واحدها `payments`)
 * ۳: نسخه ۱٫۳ برنامه (+ نحوه تقسیم هر قبض `splitMethod` و پیش‌فرض هر نوع هزینه `splitDefaults`)
 * ۴: نسخه ۱٫۵ برنامه (+ «پرداخت شد» خودِ قبض `billPaid`/`billPaidDate`، «مهلت پرداخت» `dueDate` (شمسی) و حذف نرم `deletedAt`)
 * همه قالب‌های قدیمی‌تر (۱ تا ۳) قابل بازیابی‌اند (قبض بدون splitMethod = بر اساس نفرات، بدون billPaid = پرداخت‌نشده،
 * بدون dueDate = بدون مهلت پرداخت، بدون deletedAt = حذف‌نشده).
 */
export const BACKUP_VERSION = 4;
/** حداکثر حجم قابل قبول فایل پشتیبان */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupData {
  bills: Bill[];
  units: Unit[];
  /** شامل سال‌های فعال و هشدارهای «دیگر نمایش نده» */
  settings: AppSettings;
  /** الگوی واحدها برای قبض جدید (تعداد نفرات هر واحد)؛ در فایل‌های قالب ۱ وجود ندارد */
  unitTemplate?: number[] | null;
  /** آخرین نحوه تقسیم هر نوع هزینه (از قالب ۳) */
  splitDefaults?: SplitDefaults;
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  backupVersion: number;
  appVersion: string;
  /** ISO timestamp */
  createdAt: string;
  data: BackupData;
}

export interface BackupSummary {
  bills: number;
  units: number;
  settledBills: number;
  /** قبض‌های «حذف‌شده» (از قالب ۴؛ همراه بقیه بازیابی می‌شوند) */
  deletedBills: number;
  /** سال‌هایی که قبض دارند */
  years: number[];
  createdAt: string;
  /** مثل «۱۴۰۵/۰۷/۰۴ ساعت ۱۴:۳۰» */
  createdAtFa: string;
  appVersion: string;
}

export type ParseBackupResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string };

export const BackupErrors = {
  empty: 'فایل انتخاب‌شده خالی است.',
  tooLarge: 'حجم فایل انتخاب‌شده بیش از حد مجاز است؛ این فایل، فایل پشتیبان «آپارتمانت» نیست.',
  notJson: 'فایل انتخاب‌شده قابل خواندن نیست یا خراب است (قالب JSON معتبر نیست).',
  wrongApp: 'این فایل، فایل پشتیبان برنامه «آپارتمانت» نیست.',
  badVersion: 'نسخه فایل پشتیبان نامعتبر است.',
  newer: (v: number) =>
    `این فایل پشتیبان با نسخه جدیدتری از برنامه ساخته شده است (قالب ${toPersianDigits(v)}). لطفاً ابتدا برنامه را به‌روزرسانی کنید و دوباره تلاش کنید.`,
  corrupt: (detail: string) => `فایل پشتیبان ناقص یا خراب است: ${detail}`,
};

/** نام فایل پشتیبان با تاریخ شمسی، مثل apartemant-backup-1405-07-04.json */
export function backupFileName(now: Date = new Date()): string {
  return `${BACKUP_APP_ID}-backup-${jalaliIsoDate(now)}.json`;
}

export function createBackup(data: BackupData, appVersion: string, now: Date = new Date()): BackupFile {
  return {
    app: BACKUP_APP_ID,
    backupVersion: BACKUP_VERSION,
    appVersion,
    createdAt: now.toISOString(),
    data: {
      bills: data.bills.map(migrateBill),
      units: data.units.map((u) => ({ ...u })),
      settings: sanitizeSettings(data.settings),
      ...withTemplate(data.unitTemplate),
      ...withSplitDefaults(data.splitDefaults),
    },
  };
}

function withSplitDefaults(raw: unknown): { splitDefaults?: SplitDefaults } {
  const d = sanitizeSplitDefaults(raw);
  return Object.keys(d).length ? { splitDefaults: d } : {};
}

function withTemplate(raw: unknown): { unitTemplate?: number[] } {
  const t = sanitizeUnitTemplate(raw);
  return t ? { unitTemplate: t } : {};
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const { bills, units } = backup.data;
  return {
    bills: bills.length,
    units: units.length,
    settledBills: bills.filter((b) => b.isFullySettled).length,
    deletedBills: bills.filter((b) => isBillDeleted(b)).length,
    years: Array.from(new Set(bills.map((b) => b.year))).sort((a, b) => a - b),
    createdAt: backup.createdAt,
    createdAtFa: formatJalaliDateTimeFa(new Date(backup.createdAt)),
    appVersion: backup.appVersion,
  };
}

/* ---------- validation ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const optText = (v: unknown): v is string | null | undefined => v == null || (typeof v === 'string' && v.length <= 5000);
const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

class BackupFormatError extends Error {}
const bad = (detail: string): never => { throw new BackupFormatError(detail); };
const nth = (i: number) => toPersianDigits(i + 1);

function parseBills(raw: unknown): Bill[] {
  if (!Array.isArray(raw)) bad('فهرست قبض‌ها پیدا نشد.');
  const ids = new Set<string>();
  return (raw as unknown[]).map((b, i) => {
    if (!isObj(b)) return bad(`اطلاعات قبض ${nth(i)} نامعتبر است.`);
    const ok = isId(b.id) && isInt(b.year, 1300, 1700) && isInt(b.month, 1, 12)
      && typeof b.expenseType === 'string' && b.expenseType in EXPENSE_TYPES
      && optText(b.billNumber) && optText(b.description)
      && isInt(b.totalAmount, 1) && validDate(b.createdAt) && typeof b.isFullySettled === 'boolean'
      && (b.splitMethod == null || isSplitMethod(b.splitMethod)) // نحوه تقسیم (از قالب ۳، اختیاری)
      && (b.billPaid == null || typeof b.billPaid === 'boolean') // «پرداخت شد» (از قالب ۴، اختیاری)
      && (b.billPaidDate == null || normalizePaidDate(b.billPaidDate) !== null)
      && (b.dueDate == null || parseJalaliKey(b.dueDate) !== null) // مهلت پرداخت (از قالب ۴، اختیاری)
      && (b.deletedAt == null || validDate(b.deletedAt)); // حذف نرم (از قالب ۴، اختیاری)
    if (!ok) bad(`اطلاعات قبض ${nth(i)} نامعتبر است.`);
    if (ids.has(b.id as string)) bad(`شناسه قبض ${nth(i)} تکراری است.`);
    ids.add(b.id as string);
    return migrateBill({
      id: b.id as string,
      year: b.year as number,
      month: b.month as number,
      expenseType: b.expenseType as ExpenseType,
      billNumber: (b.billNumber as string | null | undefined) ?? null,
      description: (b.description as string | null | undefined) ?? null,
      totalAmount: b.totalAmount as number,
      createdAt: b.createdAt as string,
      isFullySettled: b.isFullySettled as boolean,
      ...(isSplitMethod(b.splitMethod) ? { splitMethod: b.splitMethod } : {}),
      billPaid: b.billPaid === true,
      billPaidDate: (b.billPaidDate as string | null | undefined) ?? null,
      dueDate: (b.dueDate as string | null | undefined) ?? null,
      deletedAt: (b.deletedAt as string | null | undefined) ?? null,
    });
  });
}

/** پرداخت‌های واحد (از قالب ۲، اختیاری). وضعیت تسویه از روی مانده دوباره محاسبه می‌شود. */
function parsePayments(raw: unknown, share: number, i: number): { payments?: Payment[]; isSettled?: boolean } {
  if (raw == null) return {};
  if (!Array.isArray(raw) || raw.length > 1000) return bad(`پرداخت‌های واحد ${nth(i)} نامعتبر است.`);
  const payments = raw.map((p) => {
    if (!isObj(p) || !isId(p.id) || !isInt(p.amount, 1) || !(p.paidAt === null || validDate(p.paidAt))) {
      return bad(`پرداخت‌های واحد ${nth(i)} نامعتبر است.`);
    }
    return { id: p.id as string, amount: p.amount as number, paidAt: (p.paidAt as string | null) ?? null };
  });
  const sum = payments.reduce((s, p) => s + p.amount, 0);
  if (sum > share) bad(`جمع پرداخت‌های واحد ${nth(i)} بیشتر از سهم آن است.`);
  return { payments, isSettled: sum === share };
}

function parseUnits(raw: unknown, bills: Bill[]): Unit[] {
  if (!Array.isArray(raw)) bad('فهرست واحدها پیدا نشد.');
  const billIds = new Set(bills.map((b) => b.id));
  const ids = new Set<string>();
  return (raw as unknown[]).map((u, i) => {
    if (!isObj(u)) return bad(`اطلاعات واحد ${nth(i)} نامعتبر است.`);
    const ok = isId(u.id) && isId(u.billId) && isInt(u.unitNumber, 1, 100000) && isInt(u.personCount, 1, 1000000)
      && isInt(u.shareAmount, 0) && typeof u.isSettled === 'boolean';
    if (!ok) bad(`اطلاعات واحد ${nth(i)} نامعتبر است.`);
    if (!billIds.has(u.billId as string)) bad(`واحد ${nth(i)} به هیچ قبضی تعلق ندارد.`);
    if (ids.has(u.id as string)) bad(`شناسه واحد ${nth(i)} تکراری است.`);
    ids.add(u.id as string);
    return {
      id: u.id as string,
      billId: u.billId as string,
      unitNumber: u.unitNumber as number,
      personCount: u.personCount as number,
      shareAmount: u.shareAmount as number,
      isSettled: u.isSettled as boolean,
      ...parsePayments(u.payments, u.shareAmount as number, i),
    };
  });
}

/** اعتبارسنجی کامل متن فایل پشتیبان و تبدیل آن به داده قابل بازیابی */
export function parseBackup(text: string): ParseBackupResult {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: BackupErrors.empty };
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: BackupErrors.tooLarge };
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, error: BackupErrors.notJson };
  }
  if (!isObj(json) || json.app !== BACKUP_APP_ID) return { ok: false, error: BackupErrors.wrongApp };
  if (!isInt(json.backupVersion, 1)) return { ok: false, error: BackupErrors.badVersion };
  if (json.backupVersion > BACKUP_VERSION) return { ok: false, error: BackupErrors.newer(json.backupVersion) };

  try {
    if (!validDate(json.createdAt)) bad('تاریخ تهیه پشتیبان نامعتبر است.');
    if (!isObj(json.data)) bad('بخش اطلاعات پیدا نشد.');
    const data = json.data as Obj;
    const bills = parseBills(data.bills);
    const units = parseUnits(data.units, bills);
    for (const bill of bills) {
      const own = units.filter((u) => u.billId === bill.id);
      if (own.length === 0) bad(`قبض «${EXPENSE_TYPES[bill.expenseType].label} ${toPersianDigits(bill.month)}/${toPersianDigits(bill.year)}» هیچ واحدی ندارد.`);
      const sum = own.reduce((s, u) => s + u.shareAmount, 0);
      if (sum !== bill.totalAmount) bad(`جمع سهم واحدهای قبض «${EXPENSE_TYPES[bill.expenseType].label} ${toPersianDigits(bill.month)}/${toPersianDigits(bill.year)}» با مبلغ کل برابر نیست.`);
      if (new Set(own.map((u) => u.unitNumber)).size !== own.length) bad('شماره واحدهای یک قبض تکراری است.');
      // وضعیت کلی تسویه همیشه از روی واحدها محاسبه می‌شود
      bill.isFullySettled = own.every((u) => u.isSettled);
    }
    const settings = sanitizeSettings(isObj(data.settings) ? (data.settings as Partial<AppSettings>) : null);
    // الگوی واحدها (از قالب ۲)؛ نبودنش مشکلی نیست (از آخرین قبض ساخته می‌شود)
    if (data.unitTemplate != null && !sanitizeUnitTemplate(data.unitTemplate)) bad('الگوی واحدها نامعتبر است.');
    const backup: BackupFile = {
      app: BACKUP_APP_ID,
      backupVersion: json.backupVersion as number,
      appVersion: typeof json.appVersion === 'string' ? json.appVersion : '',
      createdAt: json.createdAt as string,
      data: { bills, units, settings, ...withTemplate(data.unitTemplate), ...withSplitDefaults(data.splitDefaults) },
    };
    return { ok: true, backup, summary: summarizeBackup(backup) };
  } catch (e) {
    if (e instanceof BackupFormatError) return { ok: false, error: BackupErrors.corrupt(e.message) };
    return { ok: false, error: BackupErrors.notJson };
  }
}

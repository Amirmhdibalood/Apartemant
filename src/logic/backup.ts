/**
 * پشتیبان‌گیری و بازیابی — منطق خالص (بدون وابستگی به پلتفرم):
 * ساخت فایل پشتیبان JSON، نام‌گذاری، اعتبارسنجی کامل فایل ورودی و خلاصه محتوای آن.
 */
import type { AppSettings, Bill, BuildingSettings, ExpenseType, Payment, Unit } from '../models/types';
import { EXPENSE_TYPE_ORDER, isCustomTypeId, isExpenseType } from '../models/constants';
import { DEFAULT_FUND_TYPES, sanitizeFundTypes } from './fundTypes';
import { sanitizeSettings } from './settings';
import { formatJalaliDateTimeFa, jalaliIsoDate } from './date';
import { toPersianDigits } from './formatting';
import { sanitizeUnitTemplate } from './unitTemplate';
import { buildingFromBills, sanitizeAlias, sanitizeBuilding } from './building';
import { isSplitMethod, sanitizeSplitDefaults, type SplitDefaults } from './split';
import { isBillDeleted, migrateBill, normalizePaidDate } from './billPaid';
import { parseJalaliKey } from './jalali';
import { parseArea } from './area';
import {
  MAX_CUSTOM_TYPES, TYPE_NAME_MAX, TYPE_NAME_MIN, cleanTypeName, isCustomColorId, isCustomIconId, typeInfo, validateCustomType,
  type CustomBillType, type CustomColorId, type CustomIconId,
} from './billTypes';

/** شناسهٔ ساختمان پیش‌فرض (هم‌ارز storage/sqlite/schema؛ اینجا تکرار شده تا منطق خالص به لایهٔ ذخیره وابسته نباشد) */
export const DEFAULT_BUILDING_ID = 'building-default';

export const BACKUP_APP_ID = 'apartemant';
/**
 * نسخه قالب فایل پشتیبان (با تغییر ساختار داده افزایش می‌یابد).
 * ۱: نسخه ۱٫۱ برنامه (قبض‌ها، واحدها، تنظیمات) — همچنان قابل بازیابی است.
 * ۲: نسخه ۱٫۲ برنامه (+ الگوی واحدها `unitTemplate` و پرداخت‌های واحدها `payments`)
 * ۳: نسخه ۱٫۳ برنامه (+ نحوه تقسیم هر قبض `splitMethod` و پیش‌فرض هر نوع هزینه `splitDefaults`)
 * ۴: نسخه ۱٫۵ برنامه (+ «پرداخت شد» خودِ قبض `billPaid`/`billPaidDate`، «مهلت پرداخت» `dueDate` (شمسی) و حذف نرم `deletedAt`)
 * ۵: نسخه ۱٫۶ برنامه (+ تنظیمات «ساختمان» `building` و اسم مستعار هر واحد در قبض `alias`؛ نفرات ۰ = واحد خالی)
 *    `unitTemplate` دیگر نوشته نمی‌شود؛ هنگام بازیابی فایل‌های ۱ تا ۴، تنظیمات ساختمان از جدیدترین قبض حذف‌نشده
 *    (وگرنه از unitTemplate، وگرنه ۱ واحد با ۱ نفر) ساخته می‌شود.
 * ۶: نسخه ۱٫۶٫۳ برنامه (+ پرچم «خالی» هر واحد در قبض `vacant` و در تنظیمات ساختمان `building.units[].vacant`)
 *    در فایل‌های ۱ تا ۵ پرچم وجود ندارد = خالی نیست؛ فقط «نفرات پیش‌فرض ۰» تنظیمات ساختمان به «خالی» تبدیل می‌شود.
 * ۷: نسخه ۱٫۶٫۵ برنامه (+ تقسیم «بر اساس متراژ» `splitMethod: "perArea"`، متراژ هر واحد در قبض `area` و در تنظیمات ساختمان
 *    `building.units[].area`؛ متراژ مترمربع است و تا ۳ رقم اعشار دارد). در فایل‌های ۱ تا ۶ متراژی وجود ندارد = وارد نشده
 *    (مهاجرت: همه متراژها خالی). «نحوه نمایش متراژ» یک ترجیح ظاهری است و داخل پشتیبان نیست.
 * ۸: نسخه ۱٫۸ برنامه (+ `buildingId` اختیاری روی قبض؛ موتور ذخیرهٔ دامنه = SQLite؛ پرداخت‌ها همچنان داخل `units[].payments` در JSON می‌آیند و هنگام بازیابی به جدول payments باز می‌شوند).
 *    قالب‌های ۱ تا ۷ بدون buildingId = ساختمان پیش‌فرض.
 * ۹: نسخه ۱.۸ (پشتیبان کامل): همهٔ ساختمان‌ها `buildings` (نام، صندوق، بایگانی، تنظیمات واحدها و تلفن‌ها)، `buildingId` اجباری
 *    روی هر قبض، دفتر صندوق `fundEntries`، دوره‌های مدیریت `managementPeriods`، جلسه‌ها با حضور و غیاب `meetings`
 *    و حالت چندساختمانی `multiBuilding`. بازیابی قالب ۹ همه‌چیز را دقیقاً سر جای خودش برمی‌گرداند.
 *    قالب‌های ۱ تا ۸ مثل قبل بازیابی می‌شوند (همه در ساختمان پیش‌فرض؛ صندوق/دوره/جلسه ندارند).
 * ۱۰: نسخه ۱.۸ (+ `buildings[].fundTypes`: قبض‌های واریزی به صندوق هر ساختمان). قالب ۹ بدون این فیلد = فقط «شارژ ساختمان».
 *    قالب‌های ۱ تا ۸ صندوق ندارند (تنظیم صندوق گوشی دست نمی‌خورد).
 * ۱۱: نسخه ۱.۹ (+ `buildings[].billTypes`: نوع‌های قبض سفارشی هر ساختمان). پشتیبان همیشه تعریف همهٔ نوع‌های سفارشی همهٔ
 *    ساختمان‌ها را دارد؛ پس در استفادهٔ عادی «نوع ناشناخته» پیش نمی‌آید. فقط برای فایل دستکاری‌شده/خراب: قبضی که نوعش نه
 *    داخلی است نه سفارشیِ تعریف‌شدهٔ ساختمانِ خودش، رد نمی‌شود و «متفرقه» بازیابی می‌شود (`summary.remappedBills`).
 *    قالب‌های ۱ تا ۱۰ نوع سفارشی ندارند.
 * همه قالب‌های قدیمی‌تر (۱ تا ۷) قابل بازیابی‌اند (قبض بدون splitMethod = بر اساس نفرات، بدون billPaid = پرداخت‌نشده،
 * بدون dueDate = بدون مهلت پرداخت، بدون deletedAt = حذف‌نشده).
 */
export const BACKUP_VERSION = 11;
/**
 * حداکثر حجم قابل قبول فایل پشتیبان. باید از بزرگ‌ترین پشتیبانی که خود برنامه می‌سازد بزرگ‌تر باشد
 * (۱۰ هزار قبض × ۱۰۰ واحد ≈ ۱۷۰ MB)؛ اگر خروجی از این سقف بگذرد، هنگام گرفتن پشتیبان هشدار داده می‌شود.
 */
export const MAX_BACKUP_BYTES = 384 * 1024 * 1024;
/** سقف تعداد ردیف‌های بخش‌های جدید قالب ۹ (ضد فایل دستکاری‌شدهٔ بی‌انتها) */
export const MAX_BACKUP_BUILDINGS = 1000;
export const MAX_BACKUP_SECTION_ROWS = 1_000_000;
/** حداکثر طول متن‌های آزاد قبض (شماره قبض/توضیحات) که بازیابی می‌پذیرد؛ فرم قبض هم بیشتر از این نمی‌گیرد */
export const MAX_BACKUP_TEXT_LENGTH = 5000;
/** سقف ورودی فرم قبض (کمتر از سقف بازیابی تا هر قبض ذخیره‌شده قابل بازیابی بماند) */
export const MAX_BILL_NUMBER_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = MAX_BACKUP_TEXT_LENGTH;

export interface BackupData {
  bills: Bill[];
  units: Unit[];
  /** شامل سال‌های فعال و هشدارهای «دیگر نمایش نده» */
  settings: AppSettings;
  /** الگوی واحدهای قالب‌های ۲ تا ۴ (فقط خوانده می‌شود، برای ساخت تنظیمات ساختمان) */
  unitTemplate?: number[] | null;
  /** تنظیمات «ساختمان» (از قالب ۵)؛ پس از parseBackup همیشه پر است */
  building?: BuildingSettings;
  /** آخرین نحوه تقسیم هر نوع هزینه (از قالب ۳) */
  splitDefaults?: SplitDefaults;
  /** از قالب ۹: همهٔ ساختمان‌ها با تنظیمات واحدها (وجودش = پشتیبان کامل؛ بازیابی همه‌چیز را جایگزین می‌کند) */
  buildings?: BackupBuilding[];
  /** از قالب ۹: دفتر صندوق همهٔ ساختمان‌ها */
  fundEntries?: BackupFundEntry[];
  /** از قالب ۹: دوره‌های مدیریت */
  managementPeriods?: BackupManagementPeriod[];
  /** از قالب ۹: جلسه‌ها (با حضور و غیاب و خلاصه) */
  meetings?: BackupMeeting[];
  /** از قالب ۹: حالت چندساختمانی و ساختمان انتخاب‌شده */
  multiBuilding?: BackupMultiBuilding;
}

export interface BackupBuilding {
  id: string;
  name: string;
  fundEnabled: boolean;
  /** قالب ۱۰: قبض‌های واریزی به صندوق (نبودن در قالب ۹ = فقط شارژ ساختمان) */
  fundTypes: ExpenseType[];
  createdAt: string;
  archivedAt: string | null;
  units: BuildingSettings['units'];
  /** قالب ۱۱: نوع‌های قبض سفارشی این ساختمان (نبودن = هیچ) */
  billTypes: BackupBillType[];
}

/** نوع قبض سفارشی در فایل پشتیبان (ساختمانش = ساختمانی که داخلش آمده) */
export interface BackupBillType {
  id: CustomBillType['id'];
  name: string;
  icon: CustomIconId;
  color: CustomColorId;
  sortOrder: number;
  hidden: boolean;
  createdAt: string;
}

export interface BackupFundEntry {
  id: string;
  buildingId: string;
  kind: 'deposit' | 'withdraw';
  amount: number;
  reason: string;
  relatedBillId: string | null;
  relatedPaymentId: string | null;
  note: string | null;
  createdAt: string;
}

export interface BackupManagementPeriod {
  id: string;
  buildingId: string;
  managerLabel: string;
  startDate: string;
  endDate: string;
  endedEarlyAt: string | null;
  notes: string | null;
}

export interface BackupMeetingAttendance {
  unitNumber: number;
  unitAlias: string | null;
  status: 'present' | 'absent' | 'empty';
}

export interface BackupMeeting {
  id: string;
  buildingId: string;
  meetingDate: string;
  weekday: string;
  hour: number;
  minute: number;
  place: string | null;
  summary: string | null;
  createdAt: string;
  attendance: BackupMeetingAttendance[];
}

export interface BackupMultiBuilding {
  enabled: boolean;
  activeBuildingId: string;
}

/** آیا این داده پشتیبان کامل (قالب ۹) است؟ */
export function isFullBackupData(d: BackupData): d is BackupData & Required<Pick<BackupData, 'buildings' | 'fundEntries' | 'managementPeriods' | 'meetings'>> {
  return Array.isArray(d.buildings) && Array.isArray(d.fundEntries) && Array.isArray(d.managementPeriods) && Array.isArray(d.meetings);
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
  /** از قالب ۹ (در قالب‌های قدیمی ۱ = ساختمان پیش‌فرض) */
  buildings: number;
  /** نوع‌های قبض سفارشی (همهٔ ساختمان‌ها؛ از قالب ۱۱) */
  customTypes: number;
  /** فقط فایل دستکاری‌شده/خراب: قبض‌هایی که نوع ناشناخته داشتند و «متفرقه» بازیابی می‌شوند (معمولاً ۰) */
  remappedBills: number;
  fundEntries: number;
  managementPeriods: number;
  meetings: number;
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
      ...withBuilding(data.building),
      ...withSplitDefaults(data.splitDefaults),
      ...(isFullBackupData(data) ? {
        buildings: data.buildings.map((b) => ({ ...b, units: b.units.map((u) => ({ ...u })), billTypes: (b.billTypes ?? []).map((t) => ({ ...t })) })),
        fundEntries: data.fundEntries.map((f) => ({ ...f })),
        managementPeriods: data.managementPeriods.map((p) => ({ ...p })),
        meetings: data.meetings.map((m) => ({ ...m, attendance: m.attendance.map((a) => ({ ...a })) })),
        multiBuilding: data.multiBuilding ? { ...data.multiBuilding } : { enabled: false, activeBuildingId: DEFAULT_BUILDING_ID },
      } : {}),
    },
  };
}

function withBuilding(raw: unknown): { building?: BuildingSettings } {
  const b = sanitizeBuilding(raw);
  return b ? { building: b } : {};
}

function withSplitDefaults(raw: unknown): { splitDefaults?: SplitDefaults } {
  const d = sanitizeSplitDefaults(raw);
  return Object.keys(d).length ? { splitDefaults: d } : {};
}

function withTemplate(raw: unknown): { unitTemplate?: number[] } {
  const t = sanitizeUnitTemplate(raw);
  return t ? { unitTemplate: t } : {};
}

/** حجم UTF-8 یک متن (بدون ساختن کپی) */
export function utf8ByteLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** اگر فایل پشتیبان از سقف بازیابی بزرگ‌تر شود، متن هشدار؛ وگرنه null (خود برنامه همیشه باید بتواند آن را بازیابی کند) */
export function backupTooLargeWarning(json: string, max = MAX_BACKUP_BYTES): string | null {
  if (json.length * 3 <= max) return null; // قطعاً زیر سقف (هر نویسه حداکثر ۳ بایت)
  const bytes = utf8ByteLength(json);
  if (bytes <= max) return null;
  const mb = (b: number) => toPersianDigits(Math.ceil(b / 1024 / 1024));
  return `حجم این نسخهٔ پشتیبان ${mb(bytes)} مگابایت است و از سقف بازیابی (${mb(max)} مگابایت) بیشتر است؛ ممکن است بعداً بازیابی نشود. قبض‌های حذف‌شدهٔ قدیمی را پاک کنید و دوباره پشتیبان بگیرید.`;
}

/** فشرده (بدون فاصله) — از ۱.۷.۹؛ parseBackup همچنان پشتیبان‌های pretty قدیمی را می‌پذیرد. */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup);
}

export function summarizeBackup(backup: BackupFile, remappedBills = 0): BackupSummary {
  const { bills, units } = backup.data;
  return {
    bills: bills.length,
    units: units.length,
    settledBills: bills.filter((b) => b.isFullySettled).length,
    deletedBills: bills.filter((b) => isBillDeleted(b)).length,
    years: Array.from(new Set(bills.map((b) => b.year))).sort((a, b) => a - b),
    buildings: backup.data.buildings?.length ?? 1,
    customTypes: (backup.data.buildings ?? []).reduce((n, b) => n + (b.billTypes?.length ?? 0), 0),
    remappedBills,
    fundEntries: backup.data.fundEntries?.length ?? 0,
    managementPeriods: backup.data.managementPeriods?.length ?? 0,
    meetings: backup.data.meetings?.length ?? 0,
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
const optText = (v: unknown): v is string | null | undefined => v == null || (typeof v === 'string' && v.length <= MAX_BACKUP_TEXT_LENGTH);
const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

class BackupFormatError extends Error {}
const bad = (detail: string): never => { throw new BackupFormatError(detail); };
const nth = (i: number) => toPersianDigits(i + 1);

/**
 * نوع قبض در فایل: رشتهٔ کوتاه و غیرِ کلید ارثی (constructor/__proto__/… همچنان رد می‌شود).
 * اینکه داخلی است یا سفارشیِ تعریف‌شدهٔ ساختمانش، بعد از خواندن ساختمان‌ها بررسی می‌شود (ناشناخته = «متفرقه»).
 */
const isTypeToken = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64
  && !(v in Object.prototype) && v !== '__proto__';

function parseBills(raw: unknown): Bill[] {
  if (!Array.isArray(raw)) bad('فهرست قبض‌ها پیدا نشد.');
  const ids = new Set<string>();
  return (raw as unknown[]).map((b, i) => {
    if (!isObj(b)) return bad(`اطلاعات قبض ${nth(i)} نامعتبر است.`);
    const ok = isId(b.id) && isInt(b.year, 1300, 1700) && isInt(b.month, 1, 12)
      && isTypeToken(b.expenseType)
      && optText(b.billNumber) && optText(b.description)
      && isInt(b.totalAmount, 1) && validDate(b.createdAt) && typeof b.isFullySettled === 'boolean'
      && (b.splitMethod == null || isSplitMethod(b.splitMethod)) // نحوه تقسیم (از قالب ۳، اختیاری)
      && (b.billPaid == null || typeof b.billPaid === 'boolean') // «پرداخت شد» (از قالب ۴، اختیاری)
      && (b.billPaidDate == null || normalizePaidDate(b.billPaidDate) !== null)
      && (b.dueDate == null || parseJalaliKey(b.dueDate) !== null) // مهلت پرداخت (از قالب ۴، اختیاری)
      && (b.deletedAt == null || validDate(b.deletedAt)) // حذف نرم (از قالب ۴، اختیاری)
      && (b.buildingId == null || isId(b.buildingId)); // از قالب ۸، اختیاری
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
      ...(typeof b.buildingId === 'string' && b.buildingId ? { buildingId: b.buildingId } : {}),
    });
  });
}

/** پرداخت‌های واحد (از قالب ۲، اختیاری). وضعیت تسویه از روی مانده دوباره محاسبه می‌شود. */
function parsePayments(raw: unknown, share: number, i: number, seen?: Set<string>): { payments?: Payment[]; isSettled?: boolean } {
  if (raw == null) return {};
  if (!Array.isArray(raw) || raw.length > 1000) return bad(`پرداخت‌های واحد ${nth(i)} نامعتبر است.`);
  const payments = raw.map((p) => {
    if (!isObj(p) || !isId(p.id) || !isInt(p.amount, 1) || !(p.paidAt === null || validDate(p.paidAt))
      || !(p.batchId === undefined || p.batchId === null || isId(p.batchId))) {
      return bad(`پرداخت‌های واحد ${nth(i)} نامعتبر است.`);
    }
    if (seen) {
      if (seen.has(p.id as string)) return bad(`شناسه پرداخت واحد ${nth(i)} تکراری است.`);
      seen.add(p.id as string);
    }
    // batchId (از ۱.۷.۳، اختیاری) حفظ می‌شود تا «لغو پرداخت» بعد از بازیابی هم کار کند؛ پشتیبان‌های قدیمی بدون آن‌اند
    return {
      id: p.id as string, amount: p.amount as number, paidAt: (p.paidAt as string | null) ?? null,
      ...(typeof p.batchId === 'string' ? { batchId: p.batchId } : {}),
    };
  });
  const sum = payments.reduce((s, p) => s + p.amount, 0);
  if (sum > share) bad(`جمع پرداخت‌های واحد ${nth(i)} بیشتر از سهم آن است.`);
  return { payments, isSettled: sum === share };
}

function parseUnits(raw: unknown, bills: Bill[]): Unit[] {
  if (!Array.isArray(raw)) bad('فهرست واحدها پیدا نشد.');
  const billIds = new Set(bills.map((b) => b.id));
  const ids = new Set<string>();
  const paymentIds = new Set<string>();
  return (raw as unknown[]).map((u, i) => {
    if (!isObj(u)) return bad(`اطلاعات واحد ${nth(i)} نامعتبر است.`);
    const ok = isId(u.id) && isId(u.billId) && isInt(u.unitNumber, 1, 100000) && isInt(u.personCount, 0, 1000000)
      && isInt(u.shareAmount, 0) && typeof u.isSettled === 'boolean'
      && (u.alias == null || (typeof u.alias === 'string' && u.alias.length <= 200)) // اسم مستعار (از قالب ۵، اختیاری)
      && (u.vacant === undefined || (typeof u.vacant === 'boolean' && (u.vacant === false || u.shareAmount === 0))) // واحد خالی (از قالب ۶)
      && (u.area == null || parseArea(u.area) !== null); // متراژ (از قالب ۷، اختیاری)
    if (!ok) bad(`اطلاعات واحد ${nth(i)} نامعتبر است.`);
    if (!billIds.has(u.billId as string)) bad(`واحد ${nth(i)} به هیچ قبضی تعلق ندارد.`);
    if (ids.has(u.id as string)) bad(`شناسه واحد ${nth(i)} تکراری است.`);
    ids.add(u.id as string);
    return {
      id: u.id as string,
      billId: u.billId as string,
      unitNumber: u.unitNumber as number,
      personCount: u.personCount as number,
      ...(u.alias !== undefined ? { alias: sanitizeAlias(u.alias) } : {}),
      ...(u.vacant === true ? { vacant: true } : {}),
      ...(u.area != null ? { area: parseArea(u.area) } : {}),
      shareAmount: u.shareAmount as number,
      isSettled: u.isSettled as boolean,
      ...parsePayments(u.payments, u.shareAmount as number, i, paymentIds),
    };
  });
}

/* ---------- قالب ۹: بخش‌های پشتیبان کامل ---------- */

const MAX_SHORT_TEXT = 200;
const reqText = (v: unknown, max = MAX_SHORT_TEXT): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const nullText = (v: unknown, max = MAX_BACKUP_TEXT_LENGTH): v is string | null => v === null || (typeof v === 'string' && v.length <= max);
const nullDate = (v: unknown): v is string | null => v === null || validDate(v);

function arrayOf(raw: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(raw)) return bad(`بخش ${label} پیدا نشد.`);
  if (raw.length > max) return bad(`تعداد ردیف‌های ${label} بیش از حد مجاز است.`);
  return raw;
}

function parseBuildings(raw: unknown): BackupBuilding[] {
  const list = arrayOf(raw, 'ساختمان‌ها', MAX_BACKUP_BUILDINGS);
  if (list.length === 0) bad('هیچ ساختمانی در فایل نیست.');
  const ids = new Set<string>();
  const typeIds = new Set<string>();
  return list.map((b, i) => {
    if (!isObj(b)) return bad(`اطلاعات ساختمان ${nth(i)} نامعتبر است.`);
    const ok = isId(b.id) && reqText(b.name) && typeof b.fundEnabled === 'boolean' && validDate(b.createdAt)
      && nullDate(b.archivedAt ?? null) && Array.isArray(b.units);
    if (!ok) bad(`اطلاعات ساختمان ${nth(i)} نامعتبر است.`);
    if (ids.has(b.id as string)) bad(`شناسه ساختمان ${nth(i)} تکراری است.`);
    ids.add(b.id as string);
    const rawUnits = b.units as unknown[];
    let units: BuildingSettings['units'] = [];
    if (rawUnits.length > 0) {
      const clean = sanitizeBuilding({ units: rawUnits });
      if (!clean) bad(`تنظیمات واحدهای ساختمان ${nth(i)} نامعتبر است.`);
      units = clean!.units;
    }
    const billTypes = parseBillTypes(b.billTypes, i, typeIds);
    let fundTypes: ExpenseType[] = [...DEFAULT_FUND_TYPES];
    if (b.fundTypes !== undefined) {
      const clean = Array.isArray(b.fundTypes) && b.fundTypes.length <= EXPENSE_TYPE_ORDER.length + billTypes.length
        ? sanitizeFundTypes(b.fundTypes) : null;
      if (!clean) bad(`قبض‌های صندوق ساختمان ${nth(i)} نامعتبر است.`);
      fundTypes = clean!;
    }
    // صندوق فقط نوع‌های داخلی و سفارشیِ همین ساختمان را نگه می‌دارد
    const own = new Set<string>(billTypes.map((t) => t.id));
    fundTypes = fundTypes.filter((t) => isExpenseType(t) || own.has(t));
    return {
      id: b.id as string, name: b.name as string, fundEnabled: b.fundEnabled as boolean, fundTypes,
      createdAt: b.createdAt as string, archivedAt: (b.archivedAt as string | null | undefined) ?? null, units, billTypes,
    };
  });
}

/** نوع‌های سفارشی یک ساختمان (قالب ۱۱)؛ همان قواعد فرم: سقف ۱۲، نام ۲ تا ۲۰ و یکتا، ترکیب نماد/رنگ یکتا */
function parseBillTypes(raw: unknown, bi: number, seenIds: Set<string>): BackupBillType[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CUSTOM_TYPES) return bad(`نوع‌های قبض سفارشی ساختمان ${nth(bi)} نامعتبر است.`);
  const out: BackupBillType[] = [];
  for (const t of raw as unknown[]) {
    const ok = isObj(t) && isCustomTypeId(t.id) && typeof t.name === 'string' && t.name.length <= 200
      && isCustomIconId(t.icon) && isCustomColorId(t.color) && isInt(t.sortOrder, 0, 10_000)
      && typeof t.hidden === 'boolean' && validDate(t.createdAt);
    if (!ok) return bad(`نوع قبض سفارشی ساختمان ${nth(bi)} نامعتبر است.`);
    const o = t as Obj;
    const name = cleanTypeName(o.name as string);
    if (name.length < TYPE_NAME_MIN || name.length > TYPE_NAME_MAX) return bad(`نام نوع قبض سفارشی ساختمان ${nth(bi)} نامعتبر است.`);
    if (seenIds.has(o.id as string)) return bad(`شناسه نوع قبض سفارشی ساختمان ${nth(bi)} تکراری است.`);
    seenIds.add(o.id as string);
    const item: BackupBillType = {
      id: o.id as BackupBillType['id'], name, icon: o.icon as CustomIconId, color: o.color as CustomColorId,
      sortOrder: o.sortOrder as number, hidden: o.hidden as boolean, createdAt: o.createdAt as string,
    };
    const err = validateCustomType(item, out.map((x) => ({ ...x, buildingId: '' })), { isNew: true });
    if (err) return bad(`نوع قبض سفارشی «${name}» ساختمان ${nth(bi)}: ${err}`);
    out.push(item);
  }
  return out;
}

/**
 * فقط دفاعی (فایل دستکاری‌شده/خراب): نوعی که نه داخلی است نه سفارشیِ تعریف‌شدهٔ ساختمانِ همان قبض ← «متفرقه».
 * `customByBuilding` = null یعنی فایل نوع سفارشی ندارد (قالب ۱ تا ۱۰ یا غیرکامل). تعداد قبض‌های تغییرکرده برمی‌گردد.
 */
export function remapUnknownBillTypes(bills: Bill[], customByBuilding: Map<string, Set<string>> | null): number {
  let n = 0;
  for (const b of bills) {
    if (isExpenseType(b.expenseType)) continue;
    const own = customByBuilding?.get(b.buildingId ?? DEFAULT_BUILDING_ID);
    if (own?.has(b.expenseType)) continue;
    b.expenseType = 'misc';
    n++;
  }
  return n;
}

function parseFundEntries(raw: unknown, buildingIds: Set<string>): BackupFundEntry[] {
  const list = arrayOf(raw, 'صندوق', MAX_BACKUP_SECTION_ROWS);
  const ids = new Set<string>();
  return list.map((f, i) => {
    if (!isObj(f)) return bad(`ردیف ${nth(i)} صندوق نامعتبر است.`);
    const ok = isId(f.id) && isId(f.buildingId) && (f.kind === 'deposit' || f.kind === 'withdraw')
      && isInt(f.amount, 1) && reqText(f.reason, 40)
      && (f.relatedBillId == null || isId(f.relatedBillId)) && (f.relatedPaymentId == null || isId(f.relatedPaymentId))
      && nullText(f.note ?? null) && validDate(f.createdAt);
    if (!ok) bad(`ردیف ${nth(i)} صندوق نامعتبر است.`);
    if (!buildingIds.has(f.buildingId as string)) bad(`ردیف ${nth(i)} صندوق به هیچ ساختمانی تعلق ندارد.`);
    if (ids.has(f.id as string)) bad(`شناسه ردیف ${nth(i)} صندوق تکراری است.`);
    ids.add(f.id as string);
    return {
      id: f.id as string, buildingId: f.buildingId as string, kind: f.kind as 'deposit' | 'withdraw',
      amount: f.amount as number, reason: f.reason as string,
      relatedBillId: (f.relatedBillId as string | null | undefined) ?? null,
      relatedPaymentId: (f.relatedPaymentId as string | null | undefined) ?? null,
      note: (f.note as string | null | undefined) ?? null, createdAt: f.createdAt as string,
    };
  });
}

function parseManagementPeriods(raw: unknown, buildingIds: Set<string>): BackupManagementPeriod[] {
  const list = arrayOf(raw, 'دوره‌های مدیریت', MAX_BACKUP_SECTION_ROWS);
  const ids = new Set<string>();
  return list.map((p, i) => {
    if (!isObj(p)) return bad(`دوره مدیریت ${nth(i)} نامعتبر است.`);
    const ok = isId(p.id) && isId(p.buildingId) && reqText(p.managerLabel) && reqText(p.startDate, 40) && reqText(p.endDate, 40)
      && nullDate(p.endedEarlyAt ?? null) && nullText(p.notes ?? null);
    if (!ok) bad(`دوره مدیریت ${nth(i)} نامعتبر است.`);
    if (!buildingIds.has(p.buildingId as string)) bad(`دوره مدیریت ${nth(i)} به هیچ ساختمانی تعلق ندارد.`);
    if (ids.has(p.id as string)) bad(`شناسه دوره مدیریت ${nth(i)} تکراری است.`);
    ids.add(p.id as string);
    return {
      id: p.id as string, buildingId: p.buildingId as string, managerLabel: p.managerLabel as string,
      startDate: p.startDate as string, endDate: p.endDate as string,
      endedEarlyAt: (p.endedEarlyAt as string | null | undefined) ?? null, notes: (p.notes as string | null | undefined) ?? null,
    };
  });
}

function parseMeetings(raw: unknown, buildingIds: Set<string>): BackupMeeting[] {
  const list = arrayOf(raw, 'جلسه‌ها', MAX_BACKUP_SECTION_ROWS);
  const ids = new Set<string>();
  return list.map((m, i) => {
    if (!isObj(m)) return bad(`جلسه ${nth(i)} نامعتبر است.`);
    const ok = isId(m.id) && isId(m.buildingId) && reqText(m.meetingDate, 40) && typeof m.weekday === 'string' && m.weekday.length <= 40
      && isInt(m.hour, 0, 23) && isInt(m.minute, 0, 59)
      && nullText(m.place ?? null, MAX_SHORT_TEXT) && nullText(m.summary ?? null) && validDate(m.createdAt)
      && Array.isArray(m.attendance) && (m.attendance as unknown[]).length <= 100000;
    if (!ok) bad(`جلسه ${nth(i)} نامعتبر است.`);
    if (!buildingIds.has(m.buildingId as string)) bad(`جلسه ${nth(i)} به هیچ ساختمانی تعلق ندارد.`);
    if (ids.has(m.id as string)) bad(`شناسه جلسه ${nth(i)} تکراری است.`);
    ids.add(m.id as string);
    const units = new Set<number>();
    const attendance = (m.attendance as unknown[]).map((a) => {
      if (!isObj(a) || !isInt(a.unitNumber, 1, 100000) || !(a.status === 'present' || a.status === 'absent' || a.status === 'empty')
        || !nullText(a.unitAlias ?? null, MAX_SHORT_TEXT)) {
        return bad(`حضور و غیاب جلسه ${nth(i)} نامعتبر است.`);
      }
      if (units.has(a.unitNumber as number)) bad(`حضور و غیاب جلسه ${nth(i)} واحد تکراری دارد.`);
      units.add(a.unitNumber as number);
      return { unitNumber: a.unitNumber as number, unitAlias: (a.unitAlias as string | null | undefined) ?? null, status: a.status as BackupMeetingAttendance['status'] };
    });
    return {
      id: m.id as string, buildingId: m.buildingId as string, meetingDate: m.meetingDate as string, weekday: m.weekday as string,
      hour: m.hour as number, minute: m.minute as number, place: (m.place as string | null | undefined) ?? null,
      summary: (m.summary as string | null | undefined) ?? null, createdAt: m.createdAt as string, attendance,
    };
  });
}

function parseMultiBuilding(raw: unknown, buildingIds: Set<string>): BackupMultiBuilding {
  if (raw == null) return { enabled: false, activeBuildingId: DEFAULT_BUILDING_ID };
  if (!isObj(raw) || typeof raw.enabled !== 'boolean' || !isId(raw.activeBuildingId)) return bad('حالت چندساختمانی نامعتبر است.');
  const active = buildingIds.has(raw.activeBuildingId as string) ? raw.activeBuildingId as string : DEFAULT_BUILDING_ID;
  return { enabled: raw.enabled as boolean, activeBuildingId: active };
}

/** واحدها به تفکیک قبض، با حفظ ترتیب اصلی (هم‌ارز units.filter(u => u.billId === id) برای هر قبض) */
export function groupUnitsByBill(units: Unit[]): Map<string, Unit[]> {
  const map = new Map<string, Unit[]>();
  for (const u of units) {
    const arr = map.get(u.billId);
    if (arr) arr.push(u);
    else map.set(u.billId, [u]);
  }
  return map;
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
    // گروه‌بندی یک‌باره واحدها بر اساس قبض (قبلاً برای هر قبض کل واحدها فیلتر می‌شد: O(قبض×واحد))
    const unitsByBill = groupUnitsByBill(units);
    const ownUnits = (billId: string): Unit[] => unitsByBill.get(billId) ?? [];
    for (const bill of bills) {
      const own = ownUnits(bill.id);
      if (own.length === 0) bad(`قبض «${typeInfo(bill.expenseType).label} ${toPersianDigits(bill.month)}/${toPersianDigits(bill.year)}» هیچ واحدی ندارد.`);
      const sum = own.reduce((s, u) => s + u.shareAmount, 0);
      if (sum !== bill.totalAmount) bad(`جمع سهم واحدهای قبض «${typeInfo(bill.expenseType).label} ${toPersianDigits(bill.month)}/${toPersianDigits(bill.year)}» با مبلغ کل برابر نیست.`);
      if (new Set(own.map((u) => u.unitNumber)).size !== own.length) bad('شماره واحدهای یک قبض تکراری است.');
      // وضعیت کلی تسویه همیشه از روی واحدها محاسبه می‌شود
      bill.isFullySettled = own.every((u) => u.isSettled);
      // تقسیم «بر اساس متراژ»: متراژ همه واحدهای غیرخالی باید ثبت شده باشد
      if (bill.splitMethod === 'perArea' && own.some((u) => !u.vacant && parseArea(u.area ?? null) === null)) {
        bad(`متراژ واحدهای قبض «${typeInfo(bill.expenseType).label} ${toPersianDigits(bill.month)}/${toPersianDigits(bill.year)}» (تقسیم بر اساس متراژ) ثبت نشده است.`);
      }
    }
    const settings = sanitizeSettings(isObj(data.settings) ? (data.settings as Partial<AppSettings>) : null);
    // الگوی واحدها (از قالب ۲)؛ نبودنش مشکلی نیست (از آخرین قبض ساخته می‌شود)
    if (data.unitTemplate != null && !sanitizeUnitTemplate(data.unitTemplate)) bad('الگوی واحدها نامعتبر است.');
    // تنظیمات ساختمان (از قالب ۵)؛ در فایل‌های قدیمی از جدیدترین قبض حذف‌نشده ساخته می‌شود
    if (data.building != null && !sanitizeBuilding(data.building)) bad('تنظیمات ساختمان نامعتبر است.');
    const building = sanitizeBuilding(data.building)
      ?? buildingFromBills(bills.map((bill) => ({ bill, units: ownUnits(bill.id) })), data.unitTemplate);
    // قالب ۹: پشتیبان کامل (همهٔ ساختمان‌ها، صندوق، دوره‌ها، جلسه‌ها)
    let full: Partial<BackupData> = {};
    // همهٔ بخش‌های کامل با هم می‌آیند یا هیچ‌کدام (فایل بدون آن‌ها مثل قالب‌های قدیمی در ساختمان پیش‌فرض بازیابی می‌شود)
    const fullKeys = ['buildings', 'fundEntries', 'managementPeriods', 'meetings'] as const;
    const present = fullKeys.filter((k) => data[k] !== undefined).length;
    if ((json.backupVersion as number) >= 9 && present > 0 && present < fullKeys.length) bad('بخشی از اطلاعات پشتیبان کامل پیدا نشد.');
    if ((json.backupVersion as number) >= 9 && present === fullKeys.length) {
      const buildings = parseBuildings(data.buildings);
      const buildingIds = new Set(buildings.map((b) => b.id));
      if (!buildingIds.has(DEFAULT_BUILDING_ID)) bad('ساختمان اصلی در فایل نیست.');
      for (let i = 0; i < bills.length; i++) {
        const bid = bills[i].buildingId;
        if (!bid) bad(`ساختمانِ قبض ${nth(i)} مشخص نیست.`);
        if (!buildingIds.has(bid!)) bad(`قبض ${nth(i)} به هیچ ساختمانی تعلق ندارد.`);
      }
      full = {
        buildings,
        fundEntries: parseFundEntries(data.fundEntries, buildingIds),
        managementPeriods: parseManagementPeriods(data.managementPeriods, buildingIds),
        meetings: parseMeetings(data.meetings, buildingIds),
        multiBuilding: parseMultiBuilding(data.multiBuilding, buildingIds),
      };
    }
    const customByBuilding = full.buildings
      ? new Map(full.buildings.map((b) => [b.id, new Set<string>(b.billTypes.map((t) => t.id))]))
      : null;
    const remapped = remapUnknownBillTypes(bills, customByBuilding);
    const backup: BackupFile = {
      app: BACKUP_APP_ID,
      backupVersion: json.backupVersion as number,
      appVersion: typeof json.appVersion === 'string' ? json.appVersion : '',
      createdAt: json.createdAt as string,
      data: { bills, units, settings, ...withTemplate(data.unitTemplate), building, ...withSplitDefaults(data.splitDefaults), ...full },
    };
    return { ok: true, backup, summary: summarizeBackup(backup, remapped) };
  } catch (e) {
    if (e instanceof BackupFormatError) return { ok: false, error: BackupErrors.corrupt(e.message) };
    return { ok: false, error: BackupErrors.notJson };
  }
}

/**
 * چرخه وضعیت خودِ قبض (از نسخه ۱.۵.۰) — منطق خالص:
 * - «پرداخت شد»: مدیر ساختمان قبض را به شرکت/اداره پرداخت کرده است (جدا از پرداخت‌های ساکنان به ازای هر واحد).
 * - «مهلت پرداخت» (dueDate): آخرین مهلت پرداخت قبض، تاریخ شمسی اختیاری.
 * - تاریخ پرداخت قبض (billPaidDate): تاریخ شمسی، پیش‌فرض امروز و قابل ویرایش.
 * - حذف نرم (deletedAt): قبض حذف‌شده به دسته «حذف‌شده» می‌رود و قابل بازگردانی است.
 * قبض پرداخت‌شده قابل حذف نیست؛ هیچ‌کدام از این وضعیت‌ها در تصویر اشتراکی قبض نمایش داده نمی‌شوند.
 */
import type { Bill } from '../models/types';
import { formatJalaliKey, parseJalaliKey, type JalaliDate } from './jalali';
import { jalaliIsoDate } from './date';

export const BillPaidMessages = {
  deleteBlocked: 'قبض پرداخت‌شده قابل حذف نیست؛ ابتدا تیک «پرداخت شد» را بردارید.',
  markedPaid: 'قبض به‌عنوان «پرداخت شد» علامت خورد.',
  markedUnpaid: 'تیک «پرداخت شد» برداشته شد.',
  deleted: 'قبض به «حذف‌شده» منتقل شد.',
  restored: 'قبض بازگردانی شد.',
  purged: 'قبض برای همیشه حذف شد.',
  deletedReadOnly: 'این قبض حذف شده است؛ ابتدا آن را بازگردانی کنید.',
  purgeNotDeleted: 'فقط قبض حذف‌شده را می‌توان برای همیشه حذف کرد.',
};

/** خطای تلاش برای حذف قبض پرداخت‌شده (محافظ لایه ذخیره‌سازی) */
export class BillDeleteBlockedError extends Error {
  constructor(message: string = BillPaidMessages.deleteBlocked) {
    super(message);
    this.name = 'BillDeleteBlockedError';
  }
}

const validDate = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));

export function isBillPaid(bill: Pick<Bill, 'billPaid'>): boolean {
  return bill.billPaid === true;
}

export function isBillDeleted(bill: Pick<Bill, 'deletedAt'>): boolean {
  return validDate(bill.deletedAt);
}

/** آیا قبض (داده نسخه‌های قبل از ۱.۵.۰ یا ناسازگار) به مهاجرت نیاز دارد؟ */
export function needsBillMigration(bill: Bill): boolean {
  const m = migrateBill(bill);
  return m.billPaid !== bill.billPaid || m.billPaidDate !== bill.billPaidDate
    || m.dueDate !== bill.dueDate || m.deletedAt !== bill.deletedAt;
}
/** نام قدیمی (سازگاری) */
export const needsBillPaidMigration = needsBillMigration;

/**
 * تاریخ پرداخت به قالب شمسی "1405-07-15"؛ برچسب زمانی ISO (داده‌های آزمایشی قدیمی) به تاریخ شمسی همان روز تبدیل می‌شود.
 * مقدار نامعتبر = null (نامشخص).
 */
export function normalizePaidDate(v: unknown): string | null {
  if (parseJalaliKey(v)) return v as string;
  if (typeof v === 'string' && v.includes('T') && validDate(v)) return jalaliIsoDate(new Date(v));
  return null;
}

/**
 * مهاجرت: فیلدهای billPaid / billPaidDate / dueDate / deletedAt صریح می‌شوند
 * (پیش‌فرض: پرداخت‌نشده، بدون مهلت پرداخت، حذف‌نشده). مقدار نامعتبر = پیش‌فرض. idempotent است.
 */
export function migrateBill(bill: Bill): Bill {
  const paid = bill.billPaid === true;
  const deleted = !paid && validDate(bill.deletedAt); // قبض پرداخت‌شده نمی‌تواند حذف‌شده باشد
  return {
    ...bill,
    billPaid: paid,
    billPaidDate: paid ? normalizePaidDate(bill.billPaidDate) : null,
    dueDate: parseJalaliKey(bill.dueDate) ? (bill.dueDate as string) : null,
    deletedAt: deleted ? (bill.deletedAt as string) : null,
  };
}

/** زدن/برداشتن تیک «پرداخت شد»؛ تاریخ پرداخت پیش‌فرض = امروز (شمسی) و قابل ویرایش با setBillPaidDate */
export function setBillPaid(bill: Bill, paid: boolean, today: JalaliDate | Date = new Date()): Bill {
  if (paid) {
    if (isBillPaid(bill) && parseJalaliKey(bill.billPaidDate)) return { ...bill };
    const key = today instanceof Date ? jalaliIsoDate(today) : formatJalaliKey(today);
    return { ...bill, billPaid: true, billPaidDate: key, deletedAt: null };
  }
  return { ...bill, billPaid: false, billPaidDate: null };
}

/** ویرایش تاریخ پرداخت قبض (فقط برای قبض پرداخت‌شده؛ تاریخ نامعتبر نادیده گرفته می‌شود) */
export function setBillPaidDate(bill: Bill, dateKey: string): Bill {
  if (!isBillPaid(bill) || !parseJalaliKey(dateKey)) return bill;
  return { ...bill, billPaidDate: dateKey };
}

/** تعیین/حذف مهلت پرداخت (null = بدون مهلت) */
export function setBillDueDate(bill: Bill, dueDate: string | null): Bill {
  return { ...bill, dueDate: parseJalaliKey(dueDate) ? dueDate : null };
}

/** قبض پرداخت‌شده قابل حذف نیست (با برداشتن تیک دوباره قابل حذف می‌شود) */
export function canDeleteBill(bill: Pick<Bill, 'billPaid'>): boolean {
  return !isBillPaid(bill);
}

/** حذف نرم: انتقال به «حذف‌شده» */
export function softDeleteBill(bill: Bill, now: Date = new Date()): Bill {
  if (!canDeleteBill(bill)) throw new BillDeleteBlockedError();
  return { ...bill, deletedAt: isBillDeleted(bill) ? bill.deletedAt : now.toISOString() };
}

/** بازگردانی قبض حذف‌شده */
export function restoreBill(bill: Bill): Bill {
  return { ...bill, deletedAt: null };
}

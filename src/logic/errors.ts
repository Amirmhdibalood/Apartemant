/**
 * تعریف خطاها (Error) — جدا از هشدارها.
 * خطاها گزینه «دیگر این پیام را نمایش نده» ندارند و تا رفع مشکل تکرار می‌شوند.
 */
import { toPersianDigits } from './formatting';

export type AppErrorCode =
  | 'AMOUNT_MISSING'
  | 'AMOUNT_INVALID'
  | 'NO_UNITS'
  | 'PERSON_COUNT_MISSING'
  | 'PERSON_COUNT_INVALID'
  | 'NO_PERSONS'
  | 'AREA_MISSING'
  | 'AREA_INVALID'
  | 'REQUIRED_MISSING'
  | 'MIN_ONE_YEAR'
  | 'MIN_ONE_UNIT'
  | 'STORAGE_FAILED'
  | 'BILL_NOT_FOUND'
  | 'BACKUP_INVALID'
  | 'ALL_VACANT'
  | 'BACKUP_FAILED'
  | 'RESTORE_FAILED';

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export const ERROR_TITLE = 'خطا';

export const Errors = {
  amountMissing: (): AppError => ({ code: 'AMOUNT_MISSING', message: 'مبلغ قبض وارد نشده است.' }),
  amountInvalid: (): AppError => ({ code: 'AMOUNT_INVALID', message: 'مبلغ قبض نامعتبر است. لطفاً یک عدد صحیح بزرگ‌تر از صفر وارد کنید.' }),
  noUnits: (): AppError => ({ code: 'NO_UNITS', message: 'هیچ واحدی اضافه نشده است. حداقل یک واحد اضافه کنید.' }),
  personCountMissing: (unitNumber: number): AppError => ({
    code: 'PERSON_COUNT_MISSING',
    message: `تعداد نفرات واحد ${toPersianDigits(unitNumber)} وارد نشده است.`,
  }),
  personCountInvalid: (unitNumber: number): AppError => ({
    code: 'PERSON_COUNT_INVALID',
    message: `تعداد نفرات واحد ${toPersianDigits(unitNumber)} نامعتبر است (باید عدد صحیح صفر یا بیشتر باشد).`,
  }),
  noPersons: (): AppError => ({
    code: 'NO_PERSONS',
    message: 'در تقسیم «بر اساس نفرات» حداقل یک واحد باید نفر داشته باشد (همه واحدها صفر نفر هستند).',
  }),
  areaMissing: (unitNumber: number): AppError => ({
    code: 'AREA_MISSING',
    message: `متراژ واحد ${toPersianDigits(unitNumber)} وارد نشده است. برای تقسیم «بر اساس متراژ» متراژ همه واحدهای غیرخالی لازم است.`,
  }),
  areaInvalid: (unitNumber: number): AppError => ({
    code: 'AREA_INVALID',
    message: `متراژ واحد ${toPersianDigits(unitNumber)} نامعتبر است (عدد بزرگ‌تر از صفر، حداکثر ۳ رقم اعشار و تا ${toPersianDigits(100000)} مترمربع).`,
  }),
  allVacant: (): AppError => ({
    code: 'ALL_VACANT',
    message: 'همه واحدها خالی هستند. حداقل یک واحد باید در محاسبه باشد (گزینه «خالی» یک واحد را خاموش کنید).',
  }),
  requiredMissing: (field: string): AppError => ({
    code: 'REQUIRED_MISSING',
    message: `اطلاعات ضروری ناقص است: ${field} انتخاب نشده است.`,
  }),
  minOneYear: (): AppError => ({ code: 'MIN_ONE_YEAR', message: 'حداقل یک سال باید فعال بماند.' }),
  minOneUnit: (): AppError => ({ code: 'MIN_ONE_UNIT', message: 'قبض باید حداقل یک واحد داشته باشد.' }),
  storageFailed: (): AppError => ({ code: 'STORAGE_FAILED', message: 'ذخیره اطلاعات با مشکل مواجه شد. دوباره تلاش کنید.' }),
  billNotFound: (): AppError => ({ code: 'BILL_NOT_FOUND', message: 'این قبض پیدا نشد.' }),
  backupInvalid: (message: string): AppError => ({ code: 'BACKUP_INVALID', message }),
  backupFailed: (): AppError => ({ code: 'BACKUP_FAILED', message: 'ساخت فایل پشتیبان با مشکل مواجه شد. دوباره تلاش کنید.' }),
  restoreFailed: (): AppError => ({
    code: 'RESTORE_FAILED',
    message: 'بازیابی اطلاعات با مشکل مواجه شد. اطلاعات قبلی شما تغییری نکرده یا از نسخه ایمنی قابل بازگشت است.',
  }),
};

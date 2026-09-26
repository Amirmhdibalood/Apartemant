/**
 * تعریف هشدارها (Warning) — جدا از خطاها.
 * هر هشدار قابل صرف‌نظر است و گزینه «دیگر این پیام را نمایش نده» دارد.
 */
import type { AppSettings, WarningId } from '../models/types';

export interface AppWarning {
  id: WarningId;
  title: string;
  /** پاراگراف‌های متن */
  lines: string[];
  confirmLabel: string;
  cancelLabel: string;
}

export const WARNINGS: Record<WarningId, AppWarning> = {
  saveConfirm: {
    id: 'saveConfirm',
    title: 'توجه',
    lines: [
      'پس از تسویه کامل تمامی واحدها، امکان ویرایش این قبض وجود نخواهد داشت.',
      'آیا از ذخیره اطلاعات اطمینان دارید؟',
    ],
    confirmLabel: 'ذخیره',
    cancelLabel: 'انصراف',
  },
  lastUnitSettle: {
    id: 'lastUnitSettle',
    title: 'هشدار',
    lines: [
      'با تسویه این واحد، همه واحدهای قبض تسویه می‌شوند و قبض قفل خواهد شد.',
      'پس از آن امکان ویرایش قبض وجود نخواهد داشت. ادامه می‌دهید؟',
    ],
    confirmLabel: 'تسویه',
    cancelLabel: 'انصراف',
  },
  duplicateBill: {
    id: 'duplicateBill',
    title: 'هشدار',
    lines: [
      'برای این نوع هزینه در همین ماه و سال قبلاً قبضی ثبت شده است.',
      'آیا می‌خواهید قبض جدید را هم ثبت کنید؟',
    ],
    confirmLabel: 'ادامه',
    cancelLabel: 'انصراف',
  },
  roundingAdjust: {
    id: 'roundingAdjust',
    title: 'هشدار',
    lines: [
      'مبلغ قبض بر تعداد نفرات بخش‌پذیر نیست.',
      'برای اینکه جمع سهم‌ها دقیقاً برابر مبلغ کل شود، سهم برخی واحدها ۱ تومان بیشتر محاسبه شده است.',
    ],
    confirmLabel: 'متوجه شدم',
    cancelLabel: '',
  },
};

/** آیا این هشدار باید نمایش داده شود؟ */
export function shouldShowWarning(id: WarningId, settings: AppSettings): boolean {
  if (id === 'saveConfirm') return settings.showSaveWarning;
  return !settings.dismissedWarnings.includes(id);
}

/** تنظیمات جدید پس از زدن «دیگر این پیام را نمایش نده» */
export function dismissWarning(id: WarningId, settings: AppSettings): AppSettings {
  if (id === 'saveConfirm') return { ...settings, showSaveWarning: false };
  if (settings.dismissedWarnings.includes(id)) return settings;
  return { ...settings, dismissedWarnings: [...settings.dismissedWarnings, id] };
}

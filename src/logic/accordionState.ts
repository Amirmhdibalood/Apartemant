/**
 * وضعیت باز/بسته بودن بخش‌های آکاردئونی تنظیمات؛ فقط در حافظهٔ همین اجرای برنامه
 * (با رفتن به تب دیگر و برگشتن حفظ می‌شود، با بستن برنامه نه). پیش‌فرض: همه بسته.
 */
const openIds = new Set<string>();

export const isAccordionOpen = (id: string): boolean => openIds.has(id);

export function setAccordionOpen(id: string, open: boolean): void {
  if (open) openIds.add(id); else openIds.delete(id);
}

/** فقط برای تست */
export function resetAccordionState(): void {
  openIds.clear();
}

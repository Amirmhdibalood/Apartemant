/**
 * لینک‌های دانلود فروشگاه برای صفحهٔ «اشتراک‌گذاری نرم‌افزار».
 * خالی = ردیف نمایش داده نمی‌شود تا لینک ساختگی در بسته نباشد.
 * بعد از انتشار، آدرس واقعی مایکت/بازار را اینجا بگذارید.
 */
export interface StoreLink {
  id: string;
  label: string;
  /** URL کامل دانلود؛ خالی = پنهان */
  url: string;
}

export const STORE_LINKS: StoreLink[] = [
  { id: 'myket', label: 'مایکت', url: '' },
  { id: 'bazaar', label: 'کافه‌بازار', url: '' },
];

export function visibleStoreLinks(links: StoreLink[] = STORE_LINKS): StoreLink[] {
  return links.filter((l) => typeof l.url === 'string' && /^https?:\/\//i.test(l.url.trim()));
}

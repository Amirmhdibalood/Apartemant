/**
 * لینک‌های دانلود فروشگاه برای صفحهٔ «اشتراک‌گذاری نرم‌افزار».
 * url خالی + comingSoon = ردیف «به‌زودی»؛ url خالی بدون comingSoon = پنهان.
 */
export interface StoreLink {
  id: string;
  label: string;
  /** URL کامل دانلود؛ خالی = بدون دکمهٔ اشتراک */
  url: string;
  /** نمایش ردیف غیرفعال «به‌زودی» وقتی هنوز لینک نیست */
  comingSoon?: boolean;
}

/**
 * نام فروشگاه(ها) در پانویس تصویر قبض: «… · دانلود از ${BILL_FOOTER_STORES}».
 * بعد از انتشار در کافه‌بازار فقط همین را «مایکت و بازار» کنید.
 */
export const BILL_FOOTER_STORES = 'مایکت';

export const STORE_LINKS: StoreLink[] = [
  { id: 'myket', label: 'مایکت', url: 'https://myket.ir/app/ir.buildingcharge.app' },
  { id: 'bazaar', label: 'کافه‌بازار', url: '', comingSoon: true },
];

export function shareableStoreLinks(links: StoreLink[] = STORE_LINKS): StoreLink[] {
  return links.filter((l) => typeof l.url === 'string' && /^https?:\/\//i.test(l.url.trim()));
}

/** ردیف‌هایی که در UI دیده می‌شوند (لینک‌دار یا به‌زودی) */
export function displayStoreLinks(links: StoreLink[] = STORE_LINKS): StoreLink[] {
  return links.filter((l) => {
    const hasUrl = typeof l.url === 'string' && /^https?:\/\//i.test(l.url.trim());
    return hasUrl || Boolean(l.comingSoon);
  });
}

/** @deprecated use shareableStoreLinks */
export function visibleStoreLinks(links: StoreLink[] = STORE_LINKS): StoreLink[] {
  return shareableStoreLinks(links);
}

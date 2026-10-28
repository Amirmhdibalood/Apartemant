/**
 * تماس و پیامک از روی شماره واحدها (آفلاین؛ بدون سرور).
 * روی اندروید: tel: شماره‌گیر را باز می‌کند؛ sms: اپ پیامک را با متن آماده.
 * ارسال واقعی گروهی ممکن است به مجوز/اپ پیامک دستگاه وابسته باشد.
 */

export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function telHref(phone: string): string {
  return `tel:${digitsOnly(phone)}`;
}

/** URI پیامک برای یک یا چند گیرنده + متن */
export function smsHref(phones: string[], body: string): string {
  const nums = phones.map(digitsOnly).filter((n) => n.length >= 3);
  const to = nums.join(',');
  const q = encodeURIComponent(body);
  // Android اغلب sms:num1,num2?body=  را می‌پذیرد
  return to ? `sms:${to}?body=${q}` : `sms:?body=${q}`;
}

export function openExternal(href: string): void {
  try {
    // Capacitor WebView: location کار می‌کند؛ window.open گاهی مسدود است
    window.location.href = href;
  } catch {
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    a.click();
  }
}

export function callUnit(phone: string): void {
  openExternal(telHref(phone));
}

export function smsUnits(phones: string[], body: string): void {
  openExternal(smsHref(phones, body));
}

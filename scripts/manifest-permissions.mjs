/**
 * حذف مجوز اینترنت از AndroidManifest.xml (برنامه هیچ درخواست شبکه‌ای ندارد؛ همه فایل‌ها داخل APK است).
 * - خط <uses-permission android:name="android.permission.INTERNET" /> قالب Capacitor حذف می‌شود؛
 * - با tools:node="remove" اگر کتابخانه‌ای هم این مجوز را اضافه کند، در Manifest نهایی (merged) حذف می‌شود.
 * WebView برنامه فایل‌ها را از داخل APK (https://localhost با shouldInterceptRequest) می‌خواند و به شبکه نیاز ندارد.
 * تابع خالص و idempotent است (اجرای چندباره همان نتیجه را می‌دهد).
 */
/**
 * مجوزهایی که از Manifest نهایی حذف می‌شوند:
 * - INTERNET: برنامه کاملاً آفلاین است.
 * - مجوزهای اعلان/هشدار سیستمی (POST_NOTIFICATIONS، RECEIVE_BOOT_COMPLETED، WAKE_LOCK، SCHEDULE_EXACT_ALARM، USE_EXACT_ALARM):
 *   برنامه اعلان سیستمی ندارد (هشدار مهلت پرداخت فقط داخل برنامه، در صفحه اصلی است)؛ اگر کتابخانه‌ای یکی از این‌ها را
 *   اضافه کند، با tools:node="remove" در Manifest نهایی نمی‌آید.
 */
export const REMOVED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
];

export function stripNetworkPermissions(xml) {
  let out = xml;
  if (!/xmlns:tools=/.test(out)) {
    out = out.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"');
  }
  for (const perm of REMOVED_PERMISSIONS) {
    const esc = perm.replace(/\./g, '\\.');
    // حذف هر تعریف قبلی این مجوز (عادی یا remove)
    out = out.replace(new RegExp(`[ \\t]*<uses-permission[^>]*android:name="${esc}"[^>]*/>[ \\t]*\\r?\\n?`, 'g'), '');
    out = out.replace(/(<manifest\b[^>]*>)/, `$1\n    <uses-permission android:name="${perm}" tools:node="remove" />`);
  }
  return out;
}

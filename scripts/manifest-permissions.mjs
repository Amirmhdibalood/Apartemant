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
 * - SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM: افزونه اعلان محلی آن را اضافه می‌کند؛ یادآوری سررسید با زمان‌بندی
 *   غیردقیق (inexact) هم کافی است و افزونه بدون این مجوز خودکار از AlarmManager.set استفاده می‌کند.
 */
export const REMOVED_PERMISSIONS = [
  'android.permission.INTERNET',
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

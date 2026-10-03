import { toPersianDigits } from './logic/formatting';

/** نسخه برنامه از package.json (هنگام build توسط Vite تزریق می‌شود) */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** مثلاً «نسخه ۱.۰.۰» */
export const APP_VERSION_FA = `نسخه ${toPersianDigits(APP_VERSION)}`;

/**
 * سازنده برنامه — یک نقطهٔ واحد برای نمایش/عدم نمایش در رابط (پایین تنظیمات).
 * TODO: نام مستعار و ایمیل کاری بعداً جایگزین شود. فعلاً نام و ایمیل سازنده در رابط برنامه نمایش داده نمی‌شود.
 * برای بازگرداندن: دو خط کامنت‌شدهٔ زیر را به‌جای null بگذارید (متن مایکت: myket/_src/contact.py).
 */
// export const DEVELOPER_NAME: string | null = 'AmirMahdi Balood';
// export const DEVELOPER_EMAIL: string | null = 'amirmahdibalood16@gmail.com';
export const DEVELOPER_NAME: string | null = null;
export const DEVELOPER_EMAIL: string | null = null;

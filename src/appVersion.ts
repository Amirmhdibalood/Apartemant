import { toPersianDigits } from './logic/formatting';

/** نسخه برنامه از package.json (هنگام build توسط Vite تزریق می‌شود) */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** مثلاً «نسخه ۱.۰.۰» */
export const APP_VERSION_FA = `نسخه ${toPersianDigits(APP_VERSION)}`;

/** سازنده برنامه (در تنظیمات، README و صفحه مایکت) */
export const DEVELOPER_NAME = 'AmirMahdi Balood';
export const DEVELOPER_EMAIL = 'amirmahdibalood16@gmail.com';

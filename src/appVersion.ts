import { toPersianDigits } from './logic/formatting';

/** نسخه برنامه از package.json (هنگام build توسط Vite تزریق می‌شود) */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** مثلاً «نسخه ۱.۰.۰» */
export const APP_VERSION_FA = `نسخه ${toPersianDigits(APP_VERSION)}`;

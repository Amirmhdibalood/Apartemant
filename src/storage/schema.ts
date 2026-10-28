/**
 * نسخهٔ منطقی دادهٔ دامنه در مخزن (برای متای سازگاری).
 * ۱: تا نسخه ۱.۴ — ۲: از نسخه ۱.۵ (فیلدهای صریح billPaid / …)
 * موتور فیزیکی از ۱.۸.۰ = SQLite (نگاه کنید به sqlite/schema.ts → SQLITE_SCHEMA_VERSION).
 */
export const SCHEMA_VERSION = 2;

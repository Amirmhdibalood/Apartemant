/**
 * واحد «خالی/تخلیه» (از ۱.۶.۳؛ یکدست‌سازی در ۱.۶.۱۲): نه خودش «واحد» حساب می‌شود و نه نفراتش، در هیچ محاسبه یا شمارشی.
 * سهمش صفر است، بدهی ندارد و به‌جای تعداد نفرات (یا متراژ) در جدول‌ها و تصویر قبض واژهٔ «خالی» نوشته می‌شود.
 */
export const VACANT_LABEL = 'خالی';

export interface MaybeVacant { vacant?: boolean }

export const isVacant = (u: MaybeVacant | undefined | null): boolean => u?.vacant === true;

/** واحدهای غیرخالی (واحدهای «واقعی») */
export const occupiedUnits = <T extends MaybeVacant>(units: readonly T[]): T[] => units.filter((u) => !isVacant(u));

/** تعداد واحدهای غیرخالی */
export const occupiedCount = (units: readonly MaybeVacant[]): number => units.reduce((n, u) => n + (isVacant(u) ? 0 : 1), 0);

/** مجموع نفرات فقط واحدهای غیرخالی (نفرات ذخیره‌شدهٔ واحد خالی هیچ‌جا جمع زده نمی‌شود) */
export const occupantTotal = (units: readonly (MaybeVacant & { personCount: number })[]): number =>
  units.reduce((s, u) => s + (isVacant(u) ? 0 : u.personCount), 0);

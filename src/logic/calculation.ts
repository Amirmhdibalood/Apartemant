/**
 * منطق محاسبه سهم واحدها (بدون وابستگی به UI یا Storage)
 *
 * مجموع نفرات   = جمع تعداد نفرات همه واحدها
 * هزینه هر نفر  = مبلغ قبض ÷ مجموع نفرات
 * سهم هر واحد  = هزینه هر نفر × تعداد نفرات آن واحد
 *
 * مبالغ به تومانِ صحیح هستند. چون تقسیم ممکن است اعشاری شود، از روش
 * «بزرگ‌ترین باقیمانده» (Largest Remainder / Hamilton) استفاده می‌شود:
 *   ۱) سهم پایه هر واحد = floor(مبلغ × نفرات واحد ÷ مجموع نفرات)
 *   ۲) باقیمانده = مبلغ کل − جمع سهم‌های پایه  (همیشه کمتر از تعداد واحدها)
 *   ۳) به هر واحد به ترتیب «بیشترین کسر حذف‌شده» ۱ تومان اضافه می‌شود؛
 *      در صورت تساوی، واحد با شماره کوچک‌تر مقدم است (کاملاً قطعی/Deterministic).
 * نتیجه: جمع سهم‌ها همیشه دقیقاً برابر مبلغ کل قبض است.
 * محاسبات داخلی با BigInt انجام می‌شود تا برای مبالغ بزرگ هم دقت از دست نرود.
 */

export interface UnitInput {
  unitNumber: number;
  personCount: number;
}

export interface UnitShare extends UnitInput {
  shareAmount: number;
  /** متراژ واحد (مترمربع) — فقط در تقسیم «بر اساس متراژ» */
  area?: number | null;
  /** آیا ۱ تومان از باقیمانده گرد کردن به این واحد اضافه شده است */
  roundedUp: boolean;
}

export interface CalculationResult {
  totalAmount: number;
  totalPersons: number;
  /** هزینه دقیق هر نفر (ممکن است اعشاری باشد) */
  perPersonExact: number;
  /** آیا تقسیم بدون باقیمانده بوده است */
  isExact: boolean;
  /** مقدار باقیمانده‌ای که به‌صورت ۱ تومانی بین واحدها پخش شد */
  remainder: number;
  shares: UnitShare[];
}

export function sumPersons(units: UnitInput[]): number {
  return units.reduce((s, u) => s + u.personCount, 0);
}

export function calculateShares(totalAmount: number, units: UnitInput[]): CalculationResult {
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
    throw new Error('totalAmount must be a positive safe integer');
  }
  if (units.length === 0) throw new Error('at least one unit is required');
  for (const u of units) {
    // از نسخه ۱.۶.۰ واحد خالی (۰ نفر) مجاز است: سهمش صفر است و هیچ‌وقت ۱ تومان باقیمانده نمی‌گیرد
    if (!Number.isInteger(u.personCount) || u.personCount < 0) {
      throw new Error(`invalid personCount for unit ${u.unitNumber}`);
    }
  }

  const totalPersons = sumPersons(units);
  if (totalPersons <= 0) throw new Error('at least one person is required');
  const T = BigInt(totalAmount);
  const P = BigInt(totalPersons);

  const rows = units.map((u, index) => {
    const numerator = T * BigInt(u.personCount);
    return {
      index,
      unit: u,
      base: numerator / P,
      frac: numerator % P, // کسر حذف‌شده (به واحد 1/P)
    };
  });

  const baseSum = rows.reduce((s, r) => s + r.base, 0n);
  const remainder = Number(T - baseSum); // 0 <= remainder < units.length

  const order = [...rows].sort((a, b) => {
    if (a.frac !== b.frac) return a.frac > b.frac ? -1 : 1;
    return a.unit.unitNumber - b.unit.unitNumber;
  });
  const bonus = new Set<number>();
  const eligible = order.filter((r) => r.unit.personCount > 0);
  for (let i = 0; i < eligible.length && i < remainder; i++) bonus.add(eligible[i].index);

  const shares: UnitShare[] = rows.map((r) => ({
    unitNumber: r.unit.unitNumber,
    personCount: r.unit.personCount,
    shareAmount: Number(r.base) + (bonus.has(r.index) ? 1 : 0),
    roundedUp: bonus.has(r.index),
  }));

  return {
    totalAmount,
    totalPersons,
    perPersonExact: totalAmount / totalPersons,
    isExact: T % P === 0n,
    remainder,
    shares,
  };
}

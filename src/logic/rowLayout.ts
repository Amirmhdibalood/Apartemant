/**
 * چیدمان بخش «چپِ» هر ردیف گزارش تصویری (مبلغ، خط ریز «از مجموع …» و چیپ وضعیت) — منطق خالص و قابل تست.
 * ریشهٔ باگ ۱.۷.۴: چیپ همیشه در `left + عرض مبلغ + ۱۰` و وسط ردیف کشیده می‌شد؛ ولی خط ریز زیر مبلغ (پهن‌تر از مبلغ)
 * از همان x شروع و تا زیر چیپ می‌رفت، پس چیپ روی «از مجموع …» می‌افتاد. حالا ستون مبلغ = max(عرض مبلغ، عرض خط ریز)
 * و چیپ بعد از کل ستون می‌آید؛ همهٔ مختصات y نسبت به وسط ردیف است.
 */
export interface Box { x0: number; x1: number; y0: number; y1: number }

/** کمترین عرض مفیدِ برچسب ردیف کنار ستون چپ؛ کمتر از آن چیپ زیر برچسب می‌رود */
export const MIN_LABEL_W = 120;
export const TAG_GAP = 10;
export const VALUE_H = 17;
export const SUB_H = 13;
export const TAG_H = 22;
/** فاصلهٔ مرکز مبلغ و خط ریز تا وسط ردیف (وقتی خط ریز هست) */
export const VALUE_DY = -7;
export const SUB_DY = 11;
/** کمترین ارتفاع ردیف وقتی خط ریز دارد: ستون مبلغ + خط ریز با فاصله جا شود */
export const MIN_ROW_H_WITH_SUB = 50;

export interface TrailingLayout {
  value: Box;
  sub: Box | null;
  tag: Box | null;
  /** عرض ستون مبلغ (بیشینهٔ مبلغ و خط ریز) */
  colW: number;
  /** کل عرضی که از لبهٔ چپ تا انتهای چیپ اشغال می‌شود (برای محاسبهٔ جای برچسب ردیف) */
  trailW: number;
}

export function rowTrailingLayout(o: { left: number; valueW: number; subW: number; tagW: number; hasSub: boolean }): TrailingLayout {
  const subW = o.hasSub ? o.subW : 0;
  const colW = Math.max(o.valueW, subW);
  const vy = o.hasSub ? VALUE_DY : 0;
  const value: Box = { x0: o.left, x1: o.left + o.valueW, y0: vy - VALUE_H / 2, y1: vy + VALUE_H / 2 };
  const sub: Box | null = o.hasSub ? { x0: o.left, x1: o.left + subW, y0: SUB_DY - SUB_H / 2, y1: SUB_DY + SUB_H / 2 } : null;
  const tagX = o.left + colW + TAG_GAP;
  const tag: Box | null = o.tagW > 0 ? { x0: tagX, x1: tagX + o.tagW, y0: -TAG_H / 2, y1: TAG_H / 2 } : null;
  const trailW = tag ? tag.x1 - o.left : colW;
  return { value, sub, tag, colW, trailW };
}

export const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

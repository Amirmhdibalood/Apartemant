export interface PopAnchor { top: number; left: number; arrowLeft: number }

/**
 * جای پنل کشویی اعلان‌ها زیر زنگوله. بک‌دراپ fixed و حداکثر ۵۲۰px وسط‌چین است؛ پنل ۱۰px از لبهٔ چپ آن شروع می‌شود
 * و فلش زیر مرکز واقعی زنگوله می‌ماند، ولی همیشه داخل پنل (۱۶ تا عرض‌پنل−۳۰) تا از صفحه بیرون نزند.
 */
export function popoverAnchor(bell: { left: number; width: number; bottom: number }, viewportWidth: number): PopAnchor {
  const shellW = Math.min(viewportWidth, 520);
  const base = (viewportWidth - shellW) / 2;
  const left = 10;
  const panelW = Math.min(340, shellW - 20);
  const arrow = bell.left + bell.width / 2 - base - left - 7;
  return { top: bell.bottom + 8, left, arrowLeft: Math.max(16, Math.min(panelW - 30, arrow)) };
}

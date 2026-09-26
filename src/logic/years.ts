/** منطق سال‌های فعال */

export function yearRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

/**
 * فعال/غیرفعال کردن یک سال. اگر با این کار هیچ سال فعالی باقی نماند null برمی‌گرداند
 * (حداقل یک سال همیشه باید فعال بماند).
 */
export function toggleYear(active: number[], year: number): number[] | null {
  if (active.includes(year)) {
    if (active.length <= 1) return null;
    return active.filter((y) => y !== year);
  }
  return [...active, year].sort((a, b) => a - b);
}

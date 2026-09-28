/**
 * تقویم شمسی (جلالی): تبدیل به/از شماره روز، طول ماه، کبیسه و اختلاف روز — منطق خالص و بدون وابستگی.
 * الگوریتم: jalaali-js (بازه ۳۳ ساله با نقاط شکست؛ معتبر برای سال‌های ۱ تا ۳۰۰۰ شمسی).
 * قالب ذخیره تاریخ‌های شمسی برنامه (مثل «مهلت پرداخت»): "1405-07-15" (ارقام انگلیسی).
 */

export interface JalaliDate { year: number; month: number; day: number }

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]) throw new RangeError(`Invalid Jalali year ${jy}`);
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** شماره روز ژولینی یک تاریخ شمسی */
export function jalaliToDayNumber({ year, month, day }: JalaliDate): number {
  const r = jalCal(year);
  return g2d(r.gy, 3, r.march) + (month - 1) * 31 - div(month, 7) * (month - 7) + day - 1;
}

/** تاریخ شمسی از شماره روز ژولینی */
export function dayNumberToJalali(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { year: jy, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { year: jy, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

/** تاریخ میلادی متناظر (ماه ۱..۱۲) */
export function jalaliToGregorian(d: JalaliDate): { year: number; month: number; day: number } {
  const g = d2g(jalaliToDayNumber(d));
  return { year: g.gy, month: g.gm, day: g.gd };
}

/** تاریخ شمسی متناظر یک تاریخ میلادی (ماه ۱..۱۲) */
export function gregorianToJalali(year: number, month: number, day: number): JalaliDate {
  return dayNumberToJalali(g2d(year, month, day));
}

/** امروز به تقویم شمسی (وقت محلی دستگاه) */
export function todayJalali(now: Date = new Date()): JalaliDate {
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** سال‌های قابل انتخاب برای تاریخ‌هایی مثل مهلت پرداخت: از کمترین تا بیشترین (سال قبض، امسال، سال بعد) */
export function dateYearOptions(...years: number[]): number[] {
  const valid = years.filter((y) => Number.isInteger(y) && y >= 1300 && y <= 1700);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export function isJalaliLeapYear(year: number): boolean {
  return jalCal(year).leap === 0;
}

/** تعداد روزهای ماه شمسی (۶ ماه اول ۳۱، بعدی ۳۰، اسفند ۲۹ یا ۳۰) */
export function jalaliMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeapYear(year) ? 30 : 29;
}

export function isValidJalali(d: JalaliDate): boolean {
  return Number.isInteger(d.year) && Number.isInteger(d.month) && Number.isInteger(d.day)
    && d.year >= 1300 && d.year <= 1700 && d.month >= 1 && d.month <= 12
    && d.day >= 1 && d.day <= jalaliMonthLength(d.year, d.month);
}

export function addJalaliDays(d: JalaliDate, days: number): JalaliDate {
  return dayNumberToJalali(jalaliToDayNumber(d) + days);
}

/** تعداد روز از a تا b (b − a) */
export function jalaliDiffDays(a: JalaliDate, b: JalaliDate): number {
  return jalaliToDayNumber(b) - jalaliToDayNumber(a);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "1405-07-15" */
export function formatJalaliKey(d: JalaliDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

/** "1405-07-15" → تاریخ معتبر یا null */
export function parseJalaliKey(s: unknown): JalaliDate | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidJalali(d) ? d : null;
}

/** «1405/07/15» برای نمایش (ارقام انگلیسی، هماهنگ با سایر اعداد برنامه) */
export function formatJalaliSlash(d: JalaliDate): string {
  return `${d.year}/${pad2(d.month)}/${pad2(d.day)}`;
}

/**
 * تبدیل رنگ روشن به معادل حالت تاریک (گزینه ۲ «سرمه‌ای عمیق») — منطق خالص و بدون وابستگی.
 *
 * یک تابع واحد برای دو کاربرد:
 *  ۱) ساخت خودکار `src/styles/dark.generated.css` از روی `global.css` (scripts/gen-dark-css.mjs)
 *  ۲) رنگ‌های درون‌خطی (آیکون نوع هزینه، تصویر صفحه اصلی) در زمان اجرا
 * پس هر دو همیشه یک پالت دارند. پالت: پس‌زمینه #0d121f، کارت #151e33، متن #d2d8e4.
 */

export type RGB = [number, number, number];

/** پارامترهای پالت تاریک (روشنایی HSL پس‌زمینه/کارت و رنگ‌مایه خنثی) */
export const DARK_PALETTE = { bgL: 0.085, cardL: 0.14, neutralHue: 222, neutralSat: 0.42 } as const;

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex(rgb: RGB): string {
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl([r0, g0, b0]: RGB): [number, number, number] {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb([h0, s, l]: [number, number, number]): RGB {
  const h = ((h0 % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as RGB;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** معادل تاریک یک رنگ (RGB) */
export function darkRgb(rgb: RGB): RGB {
  const P = DARK_PALETTE;
  const [h, s, l] = rgbToHsl(rgb);
  const blueish = h >= 195 && h <= 250;
  let nh = h, ns = s, nl = l;
  if (l >= 0.995) { // سفید ← کارت
    nh = P.neutralHue; ns = P.neutralSat; nl = P.cardL;
  } else if (l >= 0.8 && (s < 0.2 || (blueish && s < 0.7))) { // سطوح و حاشیه‌های خنثی
    if (l > 0.955 && l < 0.975 && blueish && s > 0.5 && s < 0.6) nl = P.bgL; // پس‌زمینه صفحه (#f4f7fc)
    else nl = clamp(P.cardL + (1 - l) * 0.9, P.bgL, 0.4);
    nh = P.neutralHue; ns = P.neutralSat;
  } else if (l >= 0.8) { // پس‌زمینه‌های رنگی ملایم (آبی/سبز/قرمز/زرد روشن)
    nl = clamp(0.15 + (1 - l) * 0.35, 0.12, 0.3);
    ns = clamp(s * 0.5, 0.15, 0.55);
  } else if ((l < 0.45 && s < 0.45) || (l < 0.3 && blueish && s < 0.75)) { // متن و آیکون تیره (خاکستری یا سرمه‌ای)
    nl = clamp(0.95 - l * 0.5, 0.62, 0.95);
    ns = 0.25; nh = P.neutralHue;
  } else if (l < 0.5) { // رنگ‌های اشباع تیره (متن خطا/تسویه)
    nl = clamp(l + 0.28, 0.62, 0.76);
  } else if (s < 0.45) { // خاکستری‌های میانی (متن کم‌رنگ، placeholder)
    nl = clamp(0.72 - (l - 0.45) * 0.5, 0.45, 0.72);
    nh = P.neutralHue; ns = Math.min(s, 0.15);
  } else { // رنگ‌های برند اشباع
    nl = clamp(l + 0.05, 0.5, 0.7);
  }
  return hslToRgb([nh, ns, nl]);
}

/** معادل تاریک یک رنگ هگز (۳ یا ۶ رقمی)؛ ورودی نامعتبر بدون تغییر برمی‌گردد */
export function darkHex(hex: string): string {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return hex;
  return rgbToHex(darkRgb(hexToRgb(hex)));
}

/** رنگ درون‌خطی متناسب با تم: در حالت روشن همان رنگ، در حالت تاریک معادل تاریک */
export function adaptColor(hex: string, theme: 'light' | 'dark'): string {
  return theme === 'dark' ? darkHex(hex) : hex;
}

const relLum = ([r, g, b]: RGB) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** تیره‌ترین‌کردنِ لازم برای خوانایی متن سفید روی زمینه رنگی (کنتراست ≥ ۴٫۶) */
export function darkRgbForWhiteText(rgb: RGB): RGB {
  const base = darkRgb(rgb);
  const [h, s, l0] = rgbToHsl(base);
  if (s < 0.25) return base; // زمینه خنثی تغییری لازم ندارد
  let l = l0, out = base;
  while (relLum(out) > 0.17 && l > 0.2) { l -= 0.01; out = hslToRgb([h, s, l]); }
  return out;
}

const isShadowLike = (rgb: RGB, alpha: number) => rgbToHsl(rgb)[2] < 0.3 && alpha < 0.5;

/**
 * همه رنگ‌های یک مقدار CSS (هگز ۳/۶/۸ رقمی، rgb()/rgba()) را به معادل تاریک تبدیل می‌کند.
 * `keepWhite`: برای ویژگی‌هایی مثل color/fill که سفید باید روشن بماند (متن روی دکمه‌های رنگی).
 * سایه‌های تیره (کم‌آلفا) تیره‌تر می‌شوند، نه روشن.
 */
export function darkenCssValue(value: string, keepWhite = false, onWhiteText = false): string {
  const map = onWhiteText ? darkRgbForWhiteText : darkRgb;
  let out = value.replace(/#([0-9a-fA-F]{6})([0-9a-fA-F]{2})(?![0-9a-fA-F])/g, (_m, hx: string, al: string) => {
    const rgb = hexToRgb(hx);
    const a = parseInt(al, 16) / 255;
    if (isShadowLike(rgb, a)) return '#000000' + Math.min(128, Math.round(a * 3 * 255)).toString(16).padStart(2, '0');
    if (keepWhite && rgbToHsl(rgb)[2] >= 0.995) return '#f4f6fa' + al;
    return rgbToHex(map(rgb)) + al;
  });
  out = out.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (_m, hx: string) => {
    const rgb = hexToRgb(hx);
    if (keepWhite && rgbToHsl(rgb)[2] >= 0.995) return '#f4f6fa';
    return rgbToHex(map(rgb));
  });
  out = out.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (_m, r: string, g: string, b: string, a?: string) => {
    const rgb: RGB = [+r, +g, +b];
    const alpha = a === undefined ? 1 : +a;
    if (isShadowLike(rgb, alpha)) return `rgba(0,0,0,${Math.round(Math.min(0.5, alpha * 3) * 100) / 100})`;
    const [R, G, B] = keepWhite && rgbToHsl(rgb)[2] >= 0.995 ? [244, 246, 250] : map(rgb);
    return a === undefined ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
  });
  return out;
}

export const hasCssColor = (value: string) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value);

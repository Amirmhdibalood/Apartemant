/**
 * تبدیل رنگ «آسمانی» (تم روشن پایه) به معادل پالت روشن انتخابی — منطق خالص.
 * یک تابع واحد برای: ساخت خودکار `src/styles/light.generated.css` (scripts/light-css.mjs)، رنگ‌های درون‌خطی
 * (تصویر صفحه اصلی، آیکون نوع هزینه)، تصویر قبض و پیش‌نمایش انتخابگر. برای پالت «آسمانی» همانی است.
 */
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl, type RGB } from './darkColor.ts';
import { DEFAULT_LIGHT_PALETTE, LIGHT_PALETTES, type LightPalette, type LightPaletteId } from './lightPalettes.ts';
import { PREVIEW_LIGHT_COLORS } from './darkPalettes.ts';

type PaletteArg = LightPalette | LightPaletteId | undefined;
const pal = (p: PaletteArg): LightPalette => (typeof p === 'string' ? LIGHT_PALETTES[p] : p ?? LIGHT_PALETTES[DEFAULT_LIGHT_PALETTE]);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function relLum([r, g, b]: RGB): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** بیشینهٔ روشنایی نسبی زمینه‌ای که متن سفید روی آن کنتراست ≥ ۴٫۶ دارد */
const WHITE_TEXT_MAX_LUM = 0.183;

/** معادل یک رنگ (RGB) در پالت روشن */
export function lightRgb(rgb: RGB, palette?: PaletteArg): RGB {
  const P = pal(palette);
  if (P.identity) return rgb;
  const [h, s, l] = rgbToHsl(rgb);
  const blueish = h >= 195 && h <= 250 && s > 0.12;
  const grey = s < 0.2 || (blueish && s < 0.7);
  if (l >= 0.995) return hexToRgb(P.card);
  if (l > 0.955 && l < 0.975 && blueish && s > 0.5 && s < 0.6) return hexToRgb(P.bg);
  if (l >= 0.8) {
    if (grey) { // سطوح و حاشیه‌های خنثی
      const nl = l < 0.95 ? l - P.borderDark : l;
      return hslToRgb([P.neutralHue, clamp(s * P.neutralSatMul, 0, 0.6), clamp(nl + (P.id === 'paper' && l > 0.9 ? -0.012 : 0), 0, 1)]);
    }
    if (blueish) return hslToRgb([P.accentHue, s * 0.9, l]); // پس‌زمینهٔ آبی ملایم ← رنگ‌مایهٔ تأکید
    return rgb;
  }
  if (h >= 135 && h <= 165 && s > 0.4 && l > 0.33 && l < 0.5) { // سبز موفق: تیره‌تر تا متن سفید روی آن ≥ ۴٫۶
    let g: RGB = hslToRgb([h, s, l]), gl = l;
    while (relLum(g) > WHITE_TEXT_MAX_LUM && gl > 0.25) { gl -= 0.005; g = hslToRgb([h, s, gl]); }
    return g;
  }
  if (blueish && s >= 0.45) return hslToRgb([P.accentHue, P.accentSat, clamp(P.accentL + (l - 0.57) * 0.8, 0.18, 0.7)]); // رنگ‌های برند
  if (l < 0.45 && s < 0.45) return hslToRgb([P.textHue, Math.min(s, P.textSat), l * P.textLMul]); // متن و آیکون تیره
  if (s < 0.45) return hslToRgb([P.neutralHue, Math.min(s, 0.25), clamp(l - P.greyDark, 0, 1)]); // خاکستری‌های میانی (متن کم‌رنگ)
  return rgb;
}

export function lightHex(hex: string, palette?: PaletteArg): string {
  if (pal(palette).identity || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return hex; // «آسمانی»: همانی (حتی حروف)
  return rgbToHex(lightRgb(hexToRgb(hex), palette));
}

/** شش رنگ پیش‌نمایش پالت (پس‌زمینه، کارت، متن، اصلی، موفق، خطا) از روی همان تبدیل واقعی */
export function lightSwatches(palette: PaletteArg): string[] {
  return PREVIEW_LIGHT_COLORS.map((c) => lightHex(c, palette));
}

/** نسبت کنتراست WCAG بین دو رنگ هگز */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relLum(hexToRgb(a)), relLum(hexToRgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** تیره‌کردن لازم برای خوانایی متن سفید روی زمینه رنگی (کنتراست ≥ ۴٫۵)؛ فقط برای پالت‌های غیرپیش‌فرض */
export function lightRgbForWhiteText(rgb: RGB, palette?: PaletteArg): RGB {
  const base = lightRgb(rgb, palette);
  if (pal(palette).identity || rgbToHsl(rgb)[2] >= 0.8) return base; // سطح روشن (کارت/زمینه) فقط جابه‌جا می‌شود، نه تیره
  const [h, s, l0] = rgbToHsl(base);
  if (s < 0.25) return base;
  let l = l0, out = base;
  while (relLum(out) > WHITE_TEXT_MAX_LUM && l > 0.2) { l -= 0.01; out = hslToRgb([h, s, l]); } 
  return out;
}

/**
 * همه رنگ‌های یک مقدار CSS (هگز ۳/۶/۸ رقمی، rgb()/rgba()) را به معادل پالت روشن تبدیل می‌کند.
 * `keepWhite`: برای color/fill/stroke (متن/آیکون سفید روی زمینه رنگی)؛ سفید شفاف همیشه سفید می‌ماند؛
 * `onWhiteText`: زمینهٔ قاعده‌ای که متن سفید دارد به‌اندازهٔ کافی تیره می‌شود.
 */
export function lightenCssValue(value: string, keepWhite = false, onWhiteText = false, palette?: PaletteArg): string {
  const P = pal(palette);
  if (P.identity) return value;
  const map = (rgb: RGB): RGB => (onWhiteText ? lightRgbForWhiteText(rgb, P) : lightRgb(rgb, P));
  const isWhite = (rgb: RGB) => rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255;
  const brandTranslucent = (rgb: RGB) => { const [h, s, l] = rgbToHsl(rgb); return h >= 195 && h <= 250 && s > 0.5 && l > 0.4 && l < 0.7; };
  const alphaMap = (rgb: RGB): RGB => {
    if (brandTranslucent(rgb)) return hslToRgb([P.accentHue, P.accentSat, P.accentL]); // برند نیمه‌شفاف
    if (rgbToHsl(rgb)[2] < 0.3) return hslToRgb([P.neutralHue, 0.3, 0.18]); // سایه و پرده
    return lightRgb(rgb, P);
  };
  let out = value.replace(/#([0-9a-fA-F]{6})([0-9a-fA-F]{2})(?![0-9a-fA-F])/g, (_m, hx: string, al: string) => {
    const rgb = hexToRgb(hx);
    if (isWhite(rgb)) return _m;
    return rgbToHex(alphaMap(rgb)) + al;
  });
  out = out.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (_m, hx: string) => {
    const rgb = hexToRgb(hx);
    if (keepWhite && isWhite(rgb)) return _m;
    return rgbToHex(map(rgb));
  });
  out = out.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (_m, r: string, g: string, b: string, a?: string) => {
    const rgb: RGB = [+r, +g, +b];
    if (isWhite(rgb)) return _m;
    const [R, G, B] = a === undefined ? map(rgb) : alphaMap(rgb);
    return a === undefined ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
  });
  return out;
}

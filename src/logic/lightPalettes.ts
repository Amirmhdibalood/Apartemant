/**
 * پالت‌های تم روشن (از نسخه ۱.۶.۱۳) — داده‌های خالص؛ هم مولد CSS (scripts/light-css.mjs) هم رنگ‌های درون‌خطی در زمان اجرا،
 * هم تصویر قبض و هم پیش‌نمایش کوچک انتخابگر از همین‌جا می‌خوانند، پس همیشه یک‌دست‌اند.
 * «آسمانی» (sky) پالت پیش‌فرض و همان تم روشن ۱.۶.۱۲ است (تبدیل همانی: global.css دست‌نخورده می‌ماند).
 * رنگ‌های معنایی (قرمز/زرد، رنگ نوع هزینه) در همه پالت‌ها ثابت می‌مانند؛ سبز موفق و رنگ تأکید برای کنتراست ≥ ۴٫۵ تنظیم می‌شوند.
 */
export type LightPaletteId = 'sky' | 'paper' | 'mint' | 'lavender' | 'graycool';

export interface LightPalette {
  id: LightPaletteId;
  name: string;
  desc: string;
  /** پالت پیش‌فرض: بدون هیچ تبدیلی */
  identity: boolean;
  /** پس‌زمینهٔ صفحه و کارت (هگز) */
  bg: string; card: string;
  /** رنگ‌مایهٔ سطوح خنثی و ضریب اشباع آن‌ها */
  neutralHue: number; neutralSatMul: number;
  /** رنگ‌مایه و سقف اشباع متن تیره، ضریب روشنایی متن (کمتر = تیره‌تر) */
  textHue: number; textSat: number; textLMul: number;
  /** تیره‌کردن حاشیه‌ها (برای کنتراست بالا) و تیره‌کردن خاکستری‌های میانی (متن کم‌رنگ) */
  borderDark: number; greyDark: number;
  /** رنگ‌مایه، اشباع و روشنایی رنگ تأکید (برند) — روشنایی طوری انتخاب شده که متن سفید ≥ ۴٫۵ بماند */
  accentHue: number; accentSat: number; accentL: number;
  /** رنگ نوار وضعیت/meta theme-color */
  metaColor: string;
}

const IDENT = { neutralHue: 220, neutralSatMul: 1, textHue: 225, textSat: 0.4, textLMul: 1, borderDark: 0, greyDark: 0, accentHue: 220, accentSat: 0.85, accentL: 0.57 };

export const LIGHT_PALETTES: Record<LightPaletteId, LightPalette> = {
  sky: {
    id: 'sky', name: 'آسمانی', desc: 'تم روشن فعلی (پیش‌فرض)؛ زمینهٔ آبی‌خاکستری بسیار روشن و تأکید آبی',
    identity: true, bg: '#f4f7fc', card: '#ffffff', ...IDENT, metaColor: '#DCE8FF',
  },
  paper: {
    id: 'paper', name: 'کاغذ گرم', desc: 'زمینهٔ کرم/کاغذی گرم، کارت عاجی، متن قهوه‌ای تیره و تأکید آبی جوهری؛ چشم‌نواز برای استفادهٔ طولانی',
    identity: false, bg: '#f6efe2', card: '#fffdf8', neutralHue: 38, neutralSatMul: 0.85, textHue: 28, textSat: 0.28, textLMul: 1,
    borderDark: 0, greyDark: 0.135, accentHue: 212, accentSat: 0.72, accentL: 0.4, metaColor: '#f6efe2',
  },
  mint: {
    id: 'mint', name: 'نعناعی سرد', desc: 'زمینهٔ سفید با رگهٔ نعناعی، متن سبز-اسلیتی تیره و تأکید فیروزه‌ای عمیق؛ تازه و آرام',
    identity: false, bg: '#edf7f4', card: '#fbfefd', neutralHue: 162, neutralSatMul: 0.75, textHue: 192, textSat: 0.3, textLMul: 1,
    borderDark: 0, greyDark: 0.135, accentHue: 188, accentSat: 0.82, accentL: 0.295, metaColor: '#edf7f4',
  },
  lavender: {
    id: 'lavender', name: 'اسلیت یاسی', desc: 'زمینهٔ یاسی خیلی روشن، متن اسلیت-نیلی تیره و تأکید نیلی؛ ملایم و مدرن',
    identity: false, bg: '#f1effa', card: '#fdfcff', neutralHue: 252, neutralSatMul: 0.8, textHue: 248, textSat: 0.32, textLMul: 1,
    borderDark: 0, greyDark: 0.07, accentHue: 246, accentSat: 0.62, accentL: 0.58, metaColor: '#f1effa',
  },
  graycool: {
    id: 'graycool', name: 'خاکستری سرد (کنتراست بالا)', desc: 'زمینهٔ خاکستری خنثی و کارت سفید خالص، متن تقریباً سیاه، حاشیه‌های پررنگ‌تر و آبی سیر؛ بیشترین خوانایی',
    identity: false, bg: '#eceff3', card: '#ffffff', neutralHue: 214, neutralSatMul: 0.22, textHue: 214, textSat: 0.18, textLMul: 0.62,
    borderDark: 0.07, greyDark: 0.22, accentHue: 222, accentSat: 0.82, accentL: 0.4, metaColor: '#eceff3',
  },
};

export const LIGHT_PALETTE_ORDER: readonly LightPaletteId[] = ['sky', 'paper', 'mint', 'lavender', 'graycool'];
export const DEFAULT_LIGHT_PALETTE: LightPaletteId = 'sky';

export function sanitizeLightPalette(v: unknown): LightPaletteId | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_PALETTES, v) ? (v as LightPaletteId) : null;
}

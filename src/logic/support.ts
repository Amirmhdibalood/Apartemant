/**
 * بخش «پشتیبانی» (۱.۷.۷) — منطق خالص و قابل تست: اعتبارسنجی مقدارهای `src/config/support.ts`، ساخت لینک‌ها و فهرست ردیف‌های قابل نمایش.
 * لینک‌ها بدون هیچ مجوز و پلاگینی باز می‌شوند: Capacitor هر ناوبری WebView به بیرون از برنامه را با Intent.ACTION_VIEW به برنامهٔ مربوط می‌دهد.
 */
import { SUPPORT, type SupportConfig } from '../config/support';
import { APP_VERSION } from '../appVersion';

export type SupportId = 'email' | 'phone' | 'bale' | 'telegram';

export interface SupportItem {
  id: SupportId;
  label: string;
  /** متن نمایشی (همیشه چپ‌به‌راست) */
  display: string;
  /** مقداری که کپی می‌شود */
  copy: string;
  /** لینک باز کردن برنامهٔ مربوط */
  href: string;
  /** توضیح کوتاه زیر مقدار */
  hint: string;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** ارقام فارسی/عربی → لاتین */
export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(d));
  });
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;

/** ایمیل تمیز یا null (خالی/نامعتبر) */
export function cleanEmail(v: string): string | null {
  const s = v.trim().replace(/^mailto:/i, '');
  return EMAIL_RE.test(s) ? s : null;
}

/** شماره: ارقام لاتین، فقط + اول و رقم‌ها؛ ۵ تا ۱۵ رقم. خالی/نامعتبر = null */
export function cleanPhone(v: string): string | null {
  const s = toLatinDigits(v).trim().replace(/^tel:/i, '').replace(/[\s\-()]/g, '');
  return /^\+?\d{5,15}$/.test(s) ? s : null;
}

/** شناسهٔ پیام‌رسان بدون @ و بدون آدرس سایت؛ خالی/نامعتبر = null */
export function cleanHandle(v: string): string | null {
  let s = v.trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?(t\.me|telegram\.me|ble\.ir|bale\.ai)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  s = s.trim();
  return HANDLE_RE.test(s) ? s : null;
}

/** موضوع پیش‌فرض ایمیل، شامل نسخهٔ برنامه */
export const supportSubject = (version: string = APP_VERSION): string => `پشتیبانی آپارتمانت - نسخه ${version}`;

/** ردیف‌های قابل نمایش؛ مقدار خالی یا نامعتبر حذف می‌شود */
export function buildSupportItems(cfg: SupportConfig = SUPPORT, version: string = APP_VERSION): SupportItem[] {
  const out: SupportItem[] = [];
  const email = cleanEmail(cfg.email);
  if (email) out.push({ id: 'email', label: 'ایمیل', display: email, copy: email, href: `mailto:${email}?subject=${encodeURIComponent(supportSubject(version))}`, hint: 'باز کردن در برنامهٔ ایمیل' });
  const phone = cleanPhone(cfg.phone);
  if (phone) out.push({ id: 'phone', label: 'تلفن', display: phone, copy: phone, href: `tel:${phone}`, hint: 'باز کردن شماره‌گیر (تا نزنید تماس گرفته نمی‌شود)' });
  const bale = cleanHandle(cfg.bale);
  if (bale) out.push({ id: 'bale', label: 'بله', display: `@${bale}`, copy: `@${bale}`, href: `https://ble.ir/${bale}`, hint: 'باز کردن در بله' });
  const tg = cleanHandle(cfg.telegram);
  if (tg) out.push({ id: 'telegram', label: 'تلگرام', display: `@${tg}`, copy: `@${tg}`, href: `https://t.me/${tg}`, hint: 'باز کردن در تلگرام' });
  return out;
}

/** آیا دست‌کم یک راه تماس معتبر هست؟ (وگرنه کل بخش پنهان می‌شود) */
export const hasSupport = (cfg: SupportConfig = SUPPORT): boolean => buildSupportItems(cfg).length > 0;

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SUPPORT } from '../src/config/support';
import { buildSupportItems, cleanEmail, cleanHandle, cleanPhone, hasSupport, supportSubject, toLatinDigits } from '../src/logic/support';
import { APP_VERSION } from '../src/appVersion';

const FULL = { email: 'help@mysite.ir', phone: '۰۹۱۲ ۳۴۵-۶۷۸۹', bale: '@my_bale', telegram: 'https://t.me/my_tg' };

describe('۱.۷.۷ — پشتیبانی: پیکربندی مرکزی', () => {
  it('در بستهٔ نهایی فقط ربات تلگرام واقعی پر است؛ بقیه خالی (هیچ مقدار ساختگی نمی‌رود)', () => {
    expect(SUPPORT).toEqual({ email: '', phone: '', bale: '', telegram: 'ApartemantSupportBot' });
    expect(hasSupport()).toBe(true);
    const items = buildSupportItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'telegram', label: 'ربات تلگرام', display: '@ApartemantSupportBot', copy: '@ApartemantSupportBot', href: 'https://t.me/ApartemantSupportBot', hint: 'باز کردن در تلگرام' });
  });
  it('فایل پیکربندی مقدار نمونه/ساختگی ندارد (حتی در رشته‌ها)', () => {
    const src = readFileSync('src/config/support.ts', 'utf8');
    const body = src.slice(src.indexOf('export const SUPPORT'));
    expect([...body.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter(Boolean)).toEqual(['ApartemantSupportBot']);
    expect(body).not.toMatch(/example|test|my_|sample|demo|@|\d{4,}/i);
    for (const k of ['email', 'phone', 'bale'] as const) expect(SUPPORT[k], k).toBe('');
  });
  it('هیچ مقدار تماسِ ثابت در کد رابط/محتوا نیست', () => {
    for (const f of ['src/content/help.ts', 'src/screens/SupportScreen.tsx', 'src/components/SupportContact.tsx', 'src/screens/TutorialScreen.tsx']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/example\.|\.invalid|test_|@[A-Za-z][A-Za-z0-9_]{2,}|https?:\/\/(t\.me|ble\.ir)/);
      expect(s, f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    }
  });
});

describe('۱.۷.۷ — پشتیبانی: لینک‌ها و اعتبارسنجی', () => {
  it('هر چهار ردیف با لینک درست ساخته می‌شود', () => {
    const it4 = buildSupportItems(FULL, '9.9.9');
    expect(it4.map((x) => x.id)).toEqual(['email', 'phone', 'bale', 'telegram']);
    const by = Object.fromEntries(it4.map((x) => [x.id, x]));
    expect(by.email.href).toBe(`mailto:help@mysite.ir?subject=${encodeURIComponent('پشتیبانی آپارتمانت - نسخه 9.9.9')}`);
    expect(by.phone.href).toBe('tel:09123456789');
    expect(by.phone.copy).toBe('09123456789');
    expect(by.bale.href).toBe('https://ble.ir/my_bale');
    expect(by.bale.display).toBe('@my_bale');
    expect(by.telegram.href).toBe('https://t.me/my_tg');
    expect(by.telegram.copy).toBe('@my_tg');
  });
  it('موضوع پیش‌فرض ایمیل شامل نسخهٔ برنامه است', () => {
    expect(supportSubject()).toContain(APP_VERSION);
    expect(supportSubject('1.2.3')).toBe('پشتیبانی آپارتمانت - نسخه 1.2.3');
    const e = buildSupportItems({ ...FULL, phone: '', bale: '', telegram: '' })[0];
    expect(decodeURIComponent(e.href.split('subject=')[1])).toContain(APP_VERSION);
  });
  it('تلفن فقط شماره‌گیر است (tel:) و هیچ لینک تماس مستقیم دیگری نیست', () => {
    const phone = buildSupportItems(FULL).find((x) => x.id === 'phone')!;
    expect(phone.href.startsWith('tel:')).toBe(true);
    for (const x of buildSupportItems(FULL)) expect(x.href).not.toMatch(/^(sms|intent|callto|tg|bale):/);
  });
  it('بله و تلگرام https هستند (نه tg://) و هر ردیف خالی یا نامعتبر پنهان می‌شود', () => {
    const items = buildSupportItems({ email: 'bad', phone: '12', bale: 'x', telegram: 'ok_user' });
    expect(items.map((x) => x.id)).toEqual(['telegram']);
    expect(items[0].href.startsWith('https://t.me/')).toBe(true);
    expect(buildSupportItems({ email: ' ', phone: '', bale: '', telegram: '' })).toEqual([]);
    expect(hasSupport({ email: '', phone: '', bale: '', telegram: 'ok_user' })).toBe(true);
    expect(hasSupport({ email: 'x@', phone: 'abc', bale: '@@', telegram: '' })).toBe(false);
  });
  it('پاک‌سازی ورودی‌ها', () => {
    expect(toLatinDigits('۰۹۱۲٣')).toBe('09123');
    expect(cleanEmail('mailto:Me@Site.ir')).toBe('Me@Site.ir');
    expect(cleanEmail('no-at')).toBeNull();
    expect(cleanPhone('+98 912 000-0000')).toBe('+989120000000');
    expect(cleanPhone('abc')).toBeNull();
    expect(cleanHandle('@name_1')).toBe('name_1');
    expect(cleanHandle('ble.ir/name_1')).toBe('name_1');
    expect(cleanHandle('https://t.me/name_1?x=1')).toBe('name_1');
    expect(cleanHandle('1abc')).toBeNull();
  });
});

describe('۱.۷.۷ — پشتیبانی: بدون مجوز و بدون افزونه', () => {
  it('ردیف‌ها لینک ساده‌اند و افزونه/مجوز جدیدی استفاده نمی‌شود', () => {
    const c = readFileSync('src/components/SupportContact.tsx', 'utf8');
    expect(c).toContain('href={it.href}');
    expect(c).not.toMatch(/@capacitor\/(browser|share|clipboard)|window\.open|location\.href/);
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toMatch(/@capacitor\/(browser|clipboard)/);
  });
  it('صفحهٔ پشتیبانی دو زبانه دارد و حالت «به‌زودی» برای خالی بودن', () => {
    const s = readFileSync('src/screens/SupportScreen.tsx', 'utf8');
    expect(s).toContain('سؤال‌های رایج');
    expect(s).toContain('تماس با ما');
    expect(s).toContain('راه‌های تماس به‌زودی اضافه می‌شود');
    expect(s).toContain('hasSupport()');
  });
});

describe('۱.۸.۰ — طرح تازهٔ «تماس با ما»', () => {
  const s = readFileSync('src/screens/SupportScreen.tsx', 'utf8');
  const contact = s.slice(s.indexOf("tab === 'contact' &&"));
  it('بالای کارت: یادآوری خواندن «سؤال‌های رایج» و «آموزش نرم‌افزار» که به زبانهٔ سؤال‌ها می‌رود', () => {
    const top = 'لطفاً در صورت داشتن سؤال، قبل از تماس با پشتیبانی، قسمت «سؤال‌های رایج» و «آموزش نرم‌افزار» را مطالعه کنید.';
    expect(contact).toContain(top);
    expect(contact.indexOf(top)).toBeLessThan(contact.indexOf('sp-card'));
    expect(contact).toMatch(/sp-link sp-link--top" onClick=\{\(\) => setTab\('faq'\)\}/);
    expect(s).not.toContain('قبل از پیام دادن');
  });
  it('کارت: عنوان «پشتیبانی»، یک خط «به‌زودی» و راهنمای پایین؛ متن‌های قدیمی حذف شده‌اند', () => {
    expect(contact).toContain('<div className="sp-title">پشتیبانی</div>');
    expect(contact).toContain('مسیرهای ارتباطی دیگر به‌زودی راه‌اندازی می‌شود.');
    expect(contact).toContain('با زدن ردیف، تلگرام باز می‌شود؛ نگه داشتن انگشت یا دکمهٔ کنار، نشانی را کپی می‌کند.');
    expect(contact.indexOf('مسیرهای ارتباطی دیگر')).toBeLessThan(contact.indexOf('با زدن ردیف، تلگرام'));
    expect(s).not.toContain('برنامه اینترنت و مجوز ندارد');
    expect(s).not.toContain('از یکی از راه‌های زیر پیام بدهید');
  });
  it('ردیف تلگرام لوگوی واقعی تلگرام دارد، نه آیکون عمومی هواپیما', () => {
    const c = readFileSync('src/components/SupportContact.tsx', 'utf8');
    expect(c).toMatch(/telegram: IconTelegramLogo/);
    expect(c).not.toMatch(/IconSend/);
    const icons = readFileSync('src/components/Icons.tsx', 'utf8');
    const logo = icons.slice(icons.indexOf('export const IconTelegramLogo'));
    expect(logo).toContain('#2AABEE');
    expect(logo).toContain('#229ED9');
    expect(logo).toContain('fill="#fff"');
  });
  it('موضوع آموزش «پشتیبانی» با وضعیت فعلی هماهنگ است', () => {
    const h = readFileSync('src/content/help.ts', 'utf8');
    const t = h.slice(h.indexOf("id: 'support'"), h.indexOf("related: ['privacy', 'backup', 'quick']"));
    expect(t).toContain('ربات تلگرام');
    expect(t).toContain('«آموزش نرم‌افزار»');
    expect(t).toContain('مسیرهای ارتباطی دیگر به‌زودی راه‌اندازی می‌شود');
    expect(t).not.toMatch(/سوال/);
    expect(t).not.toMatch(/ایمیل با موضوع|شماره‌گیر/);
  });
});

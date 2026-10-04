import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SUPPORT } from '../src/config/support';
import { buildSupportItems, cleanEmail, cleanHandle, cleanPhone, hasSupport, supportSubject, toLatinDigits } from '../src/logic/support';
import { APP_VERSION } from '../src/appVersion';

const FULL = { email: 'help@mysite.ir', phone: '۰۹۱۲ ۳۴۵-۶۷۸۹', bale: '@my_bale', telegram: 'https://t.me/my_tg' };

describe('۱.۷.۷ — پشتیبانی: پیکربندی مرکزی', () => {
  it('در بستهٔ نهایی هر چهار مقدار خالی است (هیچ مقدار ساختگی نمی‌رود)', () => {
    expect(SUPPORT).toEqual({ email: '', phone: '', bale: '', telegram: '' });
    expect(hasSupport()).toBe(false);
    expect(buildSupportItems()).toEqual([]);
  });
  it('فایل پیکربندی مقدار نمونه/ساختگی ندارد (حتی در رشته‌ها)', () => {
    const src = readFileSync('src/config/support.ts', 'utf8');
    const body = src.slice(src.indexOf('export const SUPPORT'));
    expect([...body.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter(Boolean)).toEqual([]);
    expect(body).not.toMatch(/example|test|@|\d{4,}/i);
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

/** پانویس تصویر قبض: همیشه «ساخته‌شده با اپلیکیشن آپارتمانت · دانلود از مایکت» با نماد برنامه — بدون کلید خاموش/روشن */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Bill, Unit } from '../src/models/types';
import { DEFAULT_SETTINGS } from '../src/models/constants';
import { sanitizeSettings } from '../src/logic/settings';
import { BILL_FOOTER_TEXT } from '../src/logic/billImage';
import { BILL_FOOTER_STORES } from '../src/config/storeLinks';
import { createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import { HELP_TOPICS } from '../src/content/help';
import { faqItems, searchFaq, searchTopics } from '../src/logic/help';
import { SettingsProvider } from '../src/context/SettingsContext';
import { FeedbackProvider } from '../src/context/FeedbackContext';
import { ShareAppSection } from '../src/components/ShareAppSection';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
import { SUPPORT as WITH_SUPPORT } from '../src/config/support';

const bill: Bill = {
  id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null,
};
const unit: Unit = { id: 'u1', billId: 'b1', unitNumber: 1, personCount: 1, shareAmount: 1000, isSettled: false };

describe('پانویس تصویر قبض — متن ثابت', () => {
  it('متن همیشگی با نام فروشگاه از یک ثابت واحد', () => {
    expect(BILL_FOOTER_STORES).toBe('مایکت');
    expect(BILL_FOOTER_TEXT).toBe('ساخته‌شده با اپلیکیشن آپارتمانت · دانلود از مایکت');
    expect(BILL_FOOTER_TEXT.endsWith(BILL_FOOTER_STORES)).toBe(true);
  });
  it('نام فروشگاه فقط در storeLinks تعریف شده (برای «مایکت و بازار» یک خط عوض شود)', () => {
    const logic = read('src/logic/billImage.ts');
    expect(logic).toContain('BILL_FOOTER_STORES');
    expect(logic).not.toContain('دانلود از مایکت');
  });
});

describe('پانویس تصویر قبض — بدون تنظیمات', () => {
  it('فیلد shareFooterPromo دیگر در تنظیمات نیست', () => {
    expect('shareFooterPromo' in DEFAULT_SETTINGS).toBe(false);
    expect('shareFooterPromo' in sanitizeSettings({ shareFooterPromo: false } as never)).toBe(false);
    for (const f of ['src/models/types.ts', 'src/models/constants.ts', 'src/logic/settings.ts', 'src/components/ShareAppSection.tsx', 'src/services/billImage.tsx']) {
      expect(read(f), f).not.toContain('shareFooterPromo');
    }
  });
  it('پشتیبان قدیمی که این فیلد را دارد، بی‌مشکل بازیابی می‌شود و فیلد نادیده گرفته می‌شود', () => {
    const o = JSON.parse(serializeBackup(createBackup({ bills: [bill], units: [unit], settings: DEFAULT_SETTINGS }, '1.8.0')));
    o.data.settings.shareFooterPromo = false;
    const r = parseBackup(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect('shareFooterPromo' in r.backup.data.settings).toBe(false);
      expect(r.backup.data.bills).toHaveLength(1);
    }
  });
});

describe('پانویس تصویر قبض — رسم و رابط', () => {
  it('renderBillImage همیشه متن ثابت و نماد برنامه را می‌کشد و تنظیمات را نمی‌خواند', () => {
    const src = read('src/services/billImage.tsx');
    expect(src).toContain('BILL_FOOTER_TEXT');
    expect(src).toContain('drawImage(a.icon');
    expect(src).not.toMatch(/promo/i);
    expect(src).not.toContain('settingsRepository');
  });
  it('بخش اشتراک‌گذاری نرم‌افزار دیگر کلید «معرفی برنامه در تصویر قبض» ندارد', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsProvider, null, createElement(FeedbackProvider, null, createElement(ShareAppSection))),
    );
    expect(html).not.toContain('معرفی برنامه در تصویر قبض');
    expect(html).not.toContain('sw-share-footer');
    expect(read('src/styles/global.css')).not.toContain('share-footer-row');
  });
});

describe('آموزش و سؤال‌های رایج — ویژگی‌های تازه', () => {
  const topic = (id: string) => HELP_TOPICS.find((t) => t.id === id)!;
  const allText = HELP_TOPICS.flatMap((t) => [t.intro, ...t.steps, ...(t.tips ?? []), ...(t.qa ?? []).flatMap((x) => [x.q, x.a])]).join(' ');

  it('هیچ متنی دربارهٔ خاموش کردن پانویس نیست؛ یک اشارهٔ خنثی به نام برنامه در تصویر هست', () => {
    expect(allText).not.toContain('معرفی برنامه در تصویر قبض');
    const img = topic('image');
    expect([...(img.tips ?? []), ...(img.qa ?? []).map((x) => x.a)].join(' ')).toContain('نام برنامه');
    expect((img.tips ?? []).join(' ')).toContain(BILL_FOOTER_TEXT);
  });

  it('هر ویژگی تازه مقدمه، قدم، نکته و دست‌کم دو سؤال رایج دارد', () => {
    for (const id of ['buildings', 'fund', 'customtypes', 'management', 'meetings', 'phones', 'backup', 'support', 'shareapp', 'image']) {
      const t = topic(id);
      expect(t, id).toBeTruthy();
      expect(t.intro.length, id).toBeGreaterThan(20);
      expect(t.steps.length, id).toBeGreaterThanOrEqual(2);
      expect((t.tips ?? []).length, id).toBeGreaterThanOrEqual(1);
      expect((t.qa ?? []).length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('سؤال‌های تازه در «سؤال‌های رایج» و جست‌وجو پیدا می‌شوند', () => {
    const faq = faqItems(WITH_SUPPORT).map((x) => x.q);
    for (const q of [
      'ساختمانی را چطور حذف کنم؟', 'نام ساختمان را چطور عوض کنم؟', 'چند نوع قبض سفارشی می‌توانم بسازم؟',
      'چرا «ثبت قبض جدید» می‌گوید دورهٔ مدیریت باز وجود ندارد؟', 'حاضر، غایب و خالی چه فرقی دارند؟',
      'دکمهٔ تماس یا پیامک را نمی‌بینم.', 'پشتیبانی که با نسخهٔ قدیمی برنامه گرفته‌ام بازیابی می‌شود؟',
      '«تماس با ما» کجاست؟', 'لینک دانلود برنامه را چطور برای همسایه‌ها بفرستم؟', 'پایین تصویر قبض چه نوشته شده؟',
    ]) expect(faq, q).toContain(q);
    expect(searchTopics('بایگانی ساختمان', WITH_SUPPORT)[0]?.id).toBe('buildings');
    expect(searchTopics('پیامک گروهی', WITH_SUPPORT)[0]?.id).toBe('phones');
    expect(searchTopics('نسخه ایمنی', WITH_SUPPORT)[0]?.id).toBe('backup');
    expect(searchTopics('لینک دانلود', WITH_SUPPORT)[0]?.id).toBe('shareapp');
    expect(searchFaq('دوره مدیریت باز', WITH_SUPPORT).some((x) => x.topicId === 'management')).toBe(true);
  });
});

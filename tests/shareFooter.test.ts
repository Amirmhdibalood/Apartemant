/** پانویس تصویر قبض: «معرفی برنامه» (نماد + دانلود از مایکت) با کلید خاموش/روشن در تنظیمات */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Bill, Unit } from '../src/models/types';
import { DEFAULT_SETTINGS } from '../src/models/constants';
import { sanitizeSettings } from '../src/logic/settings';
import { BILL_FOOTER_PLAIN, BILL_FOOTER_PROMO, billImageFooter } from '../src/logic/billImage';
import { createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import { HELP_TOPICS } from '../src/content/help';
import { SettingsProvider } from '../src/context/SettingsContext';
import { FeedbackProvider } from '../src/context/FeedbackContext';
import { ShareAppSection } from '../src/components/ShareAppSection';
import { createElement } from 'react';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const bill: Bill = {
  id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null,
};
const unit: Unit = { id: 'u1', billId: 'b1', unitNumber: 1, personCount: 1, shareAmount: 1000, isSettled: false };

describe('پانویس تصویر قبض — متن', () => {
  it('روشن: نماد + «ساخته‌شده با اپلیکیشن آپارتمانت · دانلود از مایکت»', () => {
    expect(BILL_FOOTER_PROMO).toBe('ساخته‌شده با اپلیکیشن آپارتمانت · دانلود از مایکت');
    expect(billImageFooter(true)).toEqual({ text: BILL_FOOTER_PROMO, icon: true });
  });
  it('خاموش: همان خط سادهٔ قبلی، بدون نماد و بدون نام مایکت', () => {
    expect(BILL_FOOTER_PLAIN).toBe('محاسبه‌شده با برنامه «آپارتمانت» — محاسبه شارژ ساختمان');
    expect(billImageFooter(false)).toEqual({ text: BILL_FOOTER_PLAIN, icon: false });
    expect(BILL_FOOTER_PLAIN).not.toContain('مایکت');
  });
});

describe('پانویس تصویر قبض — تنظیمات', () => {
  it('پیش‌فرض روشن است (تنظیمات تازه و تنظیمات قدیمی بدون این فیلد)', () => {
    expect(DEFAULT_SETTINGS.shareFooterPromo).toBe(true);
    expect(sanitizeSettings(null).shareFooterPromo).toBe(true);
    expect(sanitizeSettings({ showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] }).shareFooterPromo).toBe(true);
  });
  it('خاموش ذخیره می‌ماند؛ مقدار نامعتبر به پیش‌فرض برمی‌گردد', () => {
    expect(sanitizeSettings({ shareFooterPromo: false }).shareFooterPromo).toBe(false);
    expect(sanitizeSettings({ shareFooterPromo: 'no' as unknown as boolean }).shareFooterPromo).toBe(true);
  });
  it('داخل فایل پشتیبان می‌رود و برمی‌گردد؛ پشتیبان قدیمی = روشن', () => {
    const off = { ...DEFAULT_SETTINGS, shareFooterPromo: false };
    const r = parseBackup(serializeBackup(createBackup({ bills: [bill], units: [unit], settings: off }, '1.8.0')));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.data.settings.shareFooterPromo).toBe(false);
    const o = JSON.parse(serializeBackup(createBackup({ bills: [bill], units: [unit], settings: off }, '1.8.0')));
    delete o.data.settings.shareFooterPromo;
    const r2 = parseBackup(JSON.stringify(o));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.backup.data.settings.shareFooterPromo).toBe(true);
  });
});

describe('پانویس تصویر قبض — رسم و رابط', () => {
  it('renderBillImage پانویس را از تنظیمات (یا گزینهٔ promoFooter) می‌گیرد و نماد را کنار متن می‌کشد', () => {
    const src = read('src/services/billImage.tsx');
    expect(src).toContain('billImageFooter(promo)');
    expect(src).toContain('settingsRepository.get()');
    expect(src).toContain('shareFooterPromo');
    expect(src).toContain('opts.promoFooter');
    expect(src).toContain('ctx.drawImage(a.icon!');
    expect(src).not.toContain('محاسبه‌شده با برنامه «${m.appName}»');
  });
  it('کلید «معرفی برنامه در تصویر قبض» در بخش اشتراک‌گذاری نرم‌افزار با Switch مشترک', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsProvider, null, createElement(FeedbackProvider, null, createElement(ShareAppSection))),
    );
    expect(html).toContain('معرفی برنامه در تصویر قبض');
    expect(html).toContain('id="sw-share-footer"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('class="setting-row share-footer-row"');
  });
  it('استایل ردیف فقط از متغیرهای تم استفاده می‌کند (بدون رنگ ثابت)', () => {
    const css = read('src/styles/global.css');
    const block = css.slice(css.indexOf('.share-footer-row {'), css.indexOf('}', css.indexOf('.share-footer-row {')));
    expect(block).toContain('var(--border)');
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
  it('آموزش: هر دو موضوع «اشتراک‌گذاری نرم‌افزار» و «تصویر قبض» کلید را توضیح می‌دهند (سؤال‌های رایج)', () => {
    for (const id of ['shareapp', 'image']) {
      const t = HELP_TOPICS.find((x) => x.id === id)!;
      const all = JSON.stringify(t);
      expect(all).toContain('معرفی برنامه در تصویر قبض');
      expect(t.qa?.some((q) => q.a.includes('معرفی برنامه در تصویر قبض'))).toBe(true);
    }
  });
});

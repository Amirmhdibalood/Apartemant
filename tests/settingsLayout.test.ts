import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENTRY_PREFS } from '../src/logic/entryPrefs';

vi.mock('../src/context/SettingsContext', () => ({ useSettings: () => ({ settings: { activeYears: [1405], showSaveWarning: true, dismissedWarnings: [] }, updateSettings: () => undefined }) }));
vi.mock('../src/context/FeedbackContext', () => ({ useFeedback: () => ({ showErrors: () => undefined, toast: () => undefined }) }));
vi.mock('../src/context/NotifContext', () => ({ useNotif: () => ({ mode: 'sheet', setMode: () => undefined }) }));
vi.mock('../src/context/AreaModeContext', () => ({ useAreaMode: () => ({ areaMode: 'column', setAreaMode: () => undefined }) }));
vi.mock('../src/context/IconPrefsContext', () => ({ useIconPrefs: () => ({ unitIcon: 'door', areaIcon: 'm2', setUnitIcon: () => undefined, setAreaIcon: () => undefined }) }));
vi.mock('../src/context/EntryPrefsContext', () => ({ useEntryPrefs: () => ({ prefs: DEFAULT_ENTRY_PREFS, setTypeOn: () => undefined, setMethodOn: () => undefined }) }));
vi.mock('../src/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', palette: 'navy', lightPalette: 'sky', toggle: () => undefined, setTheme: () => undefined, setPalette: () => undefined, setLightPalette: () => undefined }) }));
vi.mock('../src/components/AppHeader', () => ({ AppHeader: () => null }));
vi.mock('../src/components/BuildingSection', () => ({ BuildingSection: () => createElement('div', { className: 'building-card' }, 'محتوای ساختمان') }));
vi.mock('../src/components/BackupSection', () => ({ BackupSection: () => createElement('div', { className: 'backup-card' }, 'محتوای پشتیبان') }));
const { SettingsScreen } = await import('../src/screens/SettingsScreen');

const html = renderToStaticMarkup(createElement(SettingsScreen, { onBack: () => undefined, canGoBack: true }));
const strip = (x: string) => x.replace(/<[^>]*>/g, '');
const h2s = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => strip(m[1]));
const h3s = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);

describe('ترتیب و یکدستی صفحهٔ تنظیمات', () => {
  it('ترتیب بخش‌ها: سال‌ها ← ساختمان ← انواع قبض ← تنظیمات ظاهری ← هشدارها ← پشتیبان', () => {
    expect(h2s).toEqual(['سال‌ها', 'ساختمان', 'انواع قبض و روش‌های محاسبه', 'تنظیمات ظاهری', 'هشدارها', 'پشتیبان‌گیری و بازیابی']);
  });
  it('«تنظیمات ظاهری» پنج زیرگروه دارد: تم (اول)، نحوه نمایش متراژ، نماد واحد، نماد متراژ، نحوه نمایش اعلان‌ها', () => {
    const a = html.indexOf('data-acc="appearance"');
    const end = html.indexOf('data-acc="warnings"');
    const block = html.slice(a, end);
    const subs = [...block.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);
    expect(subs).toEqual(['تم', 'نحوه نمایش متراژ', 'نماد واحد', 'نماد متراژ', 'نحوه نمایش اعلان‌ها']);
    expect(html.match(/class="settings-group( tp-group)?"/g)).toHaveLength(5);
  });
  it('هیچ‌کدام از انتخاب‌های ظاهری دیگر کارت جداگانه (h2) نیستند', () => {
    for (const t of ['نحوه نمایش متراژ', 'نماد واحد', 'نماد متراژ', 'نحوه نمایش اعلان‌ها']) expect(h2s).not.toContain(t);
    expect(h3s).toContain('انواع قبض در برنامه');
  });
  it('انتخابگرهای ظاهری سر جای خود با نقش radiogroup هستند', () => {
    for (const l of ['نحوه نمایش متراژ', 'نماد واحد', 'نماد متراژ', 'نحوه نمایش اعلان‌ها']) expect(html).toContain(`role="radiogroup" aria-label="${l}"`);
  });
  it('سرصفحهٔ چهار دکمه‌ای ستون ثابت پهن ندارد (از صفحه بیرون نزند)', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const rule = css.split('\n').find((l) => l.startsWith('.app-header--two')) ?? '';
    expect(rule).toContain('auto 1fr auto');
    expect(rule).not.toMatch(/\d+px/);
  });

  it('هر ۶ بخش آکاردئون و پیش‌فرض بسته‌اند؛ دکمهٔ عنوان داخل h2 با aria-expanded/aria-controls و ناحیهٔ region', () => {
    expect(html.match(/class="card settings-card acc[ "]/g)).toHaveLength(6);
    expect(html.match(/class="acc__head" aria-expanded="false"/g)).toHaveLength(6);
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toContain('acc is-open');
    for (const m of html.matchAll(/<h2 class="acc__title" id="([^"]+)"><button[^>]*aria-controls="([^"]+)"/g)) {
      expect(html).toContain(`id="${m[2]}" class="acc__body" role="region" aria-labelledby="${m[1]}"`);
    }
    expect(html.match(/acc__chevron/g)).toHaveLength(6);
  });
  it('نسخه و سازنده بیرون از آکاردئون و همیشه دیده می‌شوند', () => {
    const tail = html.slice(html.lastIndexOf('</section>'));
    expect(tail).toContain('app-version');
    expect(tail).toContain('app-credit');
  });
  it('حالت باز/بسته فقط در حافظهٔ نشست: ثبت، خواندن و بازنشانی', async () => {
    const { isAccordionOpen, setAccordionOpen, resetAccordionState } = await import('../src/logic/accordionState');
    resetAccordionState();
    expect(isAccordionOpen('years')).toBe(false);
    setAccordionOpen('years', true);
    expect(isAccordionOpen('years')).toBe(true);
    // رندر دوباره (مثل برگشتن از تب دیگر) بخش باز را باز نشان می‌دهد
    const again = renderToStaticMarkup(createElement(SettingsScreen, { onBack: () => undefined, canGoBack: true }));
    expect(again.match(/class="acc__head" aria-expanded="true"/g)).toHaveLength(1);
    expect(again).toContain('acc is-open');
    setAccordionOpen('years', false);
    expect(isAccordionOpen('years')).toBe(false);
    resetAccordionState();
  });
  it('هیچ ذخیره‌سازی ماندگاری برای آکاردئون نیست', () => {
    const src = readFileSync('src/logic/accordionState.ts', 'utf8') + readFileSync('src/components/Accordion.tsx', 'utf8');
    expect(src).not.toMatch(/kvStore|localStorage|Preferences/);
  });
  it('CSS: بدون اسکرول افقی (html/body/root) و انیمیشن آکاردئون با احترام به کاهش حرکت', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    expect(css).toMatch(/html \{ overflow-x: hidden;/);
    expect(css).toMatch(/body, #root \{ overflow-x: clip;/);
    expect(css).toMatch(/touch-action: pan-y/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.acc__body/);
    expect(css).toMatch(/\.acc__body \{[^}]*visibility: hidden/);
  });
});

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
vi.mock('../src/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggle: () => undefined }) }));
vi.mock('../src/components/AppHeader', () => ({ AppHeader: () => null }));
vi.mock('../src/components/BuildingSection', () => ({ BuildingSection: () => createElement('section', { className: 'card' }, createElement('h2', { className: 'card__title' }, 'ساختمان')) }));
vi.mock('../src/components/BackupSection', () => ({ BackupSection: () => createElement('section', { className: 'card' }, createElement('h2', { className: 'card__title' }, 'پشتیبان‌گیری و بازیابی')) }));
const { SettingsScreen } = await import('../src/screens/SettingsScreen');

const html = renderToStaticMarkup(createElement(SettingsScreen, { onBack: () => undefined, canGoBack: true }));
const h2s = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
const h3s = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);

describe('ترتیب و یکدستی صفحهٔ تنظیمات', () => {
  it('ترتیب بخش‌ها: سال‌ها ← ساختمان ← انواع قبض ← تنظیمات ظاهری ← هشدارها ← پشتیبان', () => {
    expect(h2s).toEqual(['سال‌ها', 'ساختمان', 'انواع قبض و روش‌های محاسبه', 'تنظیمات ظاهری', 'هشدارها', 'پشتیبان‌گیری و بازیابی']);
  });
  it('«تنظیمات ظاهری» چهار زیرگروه دارد: نحوه نمایش متراژ، نماد واحد، نماد متراژ، نحوه نمایش اعلان‌ها', () => {
    const a = html.indexOf('id="appearance-title"');
    const end = html.indexOf('هشدارها</h2>');
    const block = html.slice(a, end);
    const subs = [...block.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);
    expect(subs).toEqual(['نحوه نمایش متراژ', 'نماد واحد', 'نماد متراژ', 'نحوه نمایش اعلان‌ها']);
    expect(html.match(/class="settings-group"/g)).toHaveLength(4);
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
});

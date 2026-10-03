import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREA_ICONS, DEFAULT_AREA_ICON, DEFAULT_UNIT_ICON, UNIT_ICONS, sanitizeAreaIcon, sanitizeUnitIcon } from '../src/logic/iconPrefs';
import { createBackup, serializeBackup } from '../src/logic/backup';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
let prefs = { unitIcon: 'door', areaIcon: 'm2' } as { unitIcon: string; areaIcon: string };
vi.mock('../src/context/IconPrefsContext', () => ({ useIconPrefs: () => ({ ...prefs, setUnitIcon: () => undefined, setAreaIcon: () => undefined }) }));
vi.mock('../src/context/AreaModeContext', () => ({ useAreaMode: () => ({ areaMode: 'column', setAreaMode: () => undefined }) }));
const { iconPrefsRepository } = await import('../src/storage/iconPrefsRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { UnitsEditor } = await import('../src/components/UnitsEditor');
const { UnitIcon, AreaIcon } = await import('../src/components/PrefIcons');

describe('نماد واحد / نماد متراژ: منطق', () => {
  it('پیش‌فرض‌ها و فهرست گزینه‌ها', () => {
    expect(DEFAULT_UNIT_ICON).toBe('door');
    expect(DEFAULT_AREA_ICON).toBe('m2');
    expect(UNIT_ICONS.map((o) => o.label)).toEqual(['در', 'ساختمان', 'کلید', 'خانه', 'شماره‌ی واحد', 'آدمک']);
    expect(AREA_ICONS).toHaveLength(6);
    expect(AREA_ICONS.map((o) => o.id)).toContain('none');
  });
  it('پاکسازی مقدار نامعتبر', () => {
    expect(sanitizeUnitIcon('key')).toBe('key');
    expect(sanitizeUnitIcon('x')).toBeNull();
    expect(sanitizeUnitIcon(null)).toBeNull();
    expect(sanitizeAreaIcon('none')).toBe('none');
    expect(sanitizeAreaIcon('door')).toBeNull();
  });
});

describe('ذخیرهٔ نمادها', () => {
  beforeEach(() => mem.clear());
  it('پیش‌فرض، ذخیره/خواندن، کلیدهای جدا و خارج از پشتیبان', async () => {
    expect(await iconPrefsRepository.getUnitIcon()).toBe('door');
    expect(await iconPrefsRepository.getAreaIcon()).toBe('m2');
    await iconPrefsRepository.saveUnitIcon('home');
    await iconPrefsRepository.saveAreaIcon('none');
    expect(mem.get('unitIcon')).toBe('"home"');
    expect(mem.get('areaIcon')).toBe('"none"');
    expect(await iconPrefsRepository.getUnitIcon()).toBe('home');
    expect(await iconPrefsRepository.getAreaIcon()).toBe('none');
    const collected = JSON.stringify(await backupRepository.collect());
    expect(collected).not.toContain('unitIcon');
    expect(collected).not.toContain('areaIcon');
    expect(serializeBackup(createBackup(await backupRepository.collect(), '1.6.7'))).not.toContain('Icon');
  });
  it('مقدار خراب ← پیش‌فرض', async () => {
    mem.set('unitIcon', '"zzz"'); mem.set('areaIcon', '5');
    expect(await iconPrefsRepository.getUnitIcon()).toBe('door');
    expect(await iconPrefsRepository.getAreaIcon()).toBe('m2');
  });
});

describe('رندر نمادها', () => {
  const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
  it('هر نماد واحد متفاوت است؛ آدمک دایره دارد، شماره، شمارهٔ فارسی', () => {
    const out = (['door', 'building', 'key', 'home', 'person'] as const).map((id) => html(createElement(UnitIcon, { id, number: 3 })));
    expect(new Set(out).size).toBe(5);
    expect(out[4]).toContain('<circle cx="12" cy="8"');
    expect(html(createElement(UnitIcon, { id: 'number', number: 12 }))).toContain('۱۲');
  });
  it('نمادهای متراژ: m² متن دارد، «بدون نماد» خالی', () => {
    expect(html(createElement(AreaIcon, { id: 'm2' }))).toContain('>m</text>');
    expect(html(createElement(AreaIcon, { id: 'none' }))).toBe('');
    const set = new Set((['arrows', 'plan', 'm2', 'expand', 'homeRuler'] as const).map((id) => html(createElement(AreaIcon, { id }))));
    expect(set.size).toBe(5);
  });
  const form = () => renderToStaticMarkup(createElement(UnitsEditor, {
    personCounts: ['3', '2'], unitAliases: [null, null], unitVacant: [false, false], unitAreas: ['100', '50'], amountDigits: '3000000', splitMethod: 'perArea',
    onAdd: () => undefined, onRemoveLast: () => undefined, onChangeCount: () => undefined, onChangeVacant: () => undefined, onChangeArea: () => undefined,
  }));
  it('فرم قبض: پیش‌فرض در + m²؛ انتخاب‌ها اعمال می‌شوند', () => {
    prefs = { unitIcon: 'door', areaIcon: 'm2' };
    const a = form();
    expect(a.match(/<span class="unit-avatar">.*?<\/span>/g)![0]).not.toContain('cy="8"'); // آدمک نیست
    expect(a).toContain('>m</text>');
    prefs = { unitIcon: 'number', areaIcon: 'none' };
    const b = form();
    expect(b).toMatch(/<span class="unit-avatar"><span class="unit-num"[^>]*>۱<\/span>/);
    expect(b).not.toContain('>m</text>');
    prefs = { unitIcon: 'person', areaIcon: 'plan' };
    const c = form();
    expect(c.match(/<span class="unit-avatar">.*?<\/span>/g)![0]).toContain('cy="8"');
    prefs = { unitIcon: 'door', areaIcon: 'm2' };
  });
});

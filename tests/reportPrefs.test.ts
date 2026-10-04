/** ۱.۷.۰ — «نمایش گزارش‌ها»: پیش‌فرض، حداقل یکی روشن، ذخیره خارج از پشتیبان، فهرست و تنظیمات */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORTS, REPORT_IDS, isReportId, reportInfo } from '../src/logic/reportCatalog';
import { DEFAULT_REPORT_PREFS, isReportVisible, resolveReport, sanitizeReportPrefs, setReportVisible, visibleReports } from '../src/logic/reportPrefs';
import { createBackup, serializeBackup } from '../src/logic/backup';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { reportPrefsRepository } = await import('../src/storage/reportPrefsRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { ReportsHub } = await import('../src/screens/reports/ReportsHub');

describe('فهرست گزارش‌ها', () => {
  it('شش گزارش یکتا؛ سه گزارش جدید نشان «جدید» دارند؛ دو گروه', () => {
    expect(REPORTS).toHaveLength(6);
    expect(new Set(REPORT_IDS).size).toBe(6);
    expect(REPORTS.filter((r) => r.isNew).map((r) => r.id)).toEqual(['monthly', 'monthlyDetail', 'charts']);
    expect(new Set(REPORTS.map((r) => r.group))).toEqual(new Set(['costs', 'debts']));
    expect(isReportId('charts')).toBe(true);
    expect(isReportId('nope')).toBe(false);
    expect(reportInfo('debtors').title).toBe('بدهکاران');
  });
});

describe('تنظیم نمایش گزارش‌ها', () => {
  it('پیش‌فرض همه روشن؛ مقدار خراب/تهی/ناشناخته ← همه روشن؛ ترتیب فهرست حفظ می‌شود', () => {
    expect(DEFAULT_REPORT_PREFS.visible).toEqual(REPORT_IDS);
    for (const bad of [null, undefined, 'x', 5, {}, { visible: 'water' }, { visible: [] }, { visible: ['zzz'] }]) expect(sanitizeReportPrefs(bad).visible).toEqual(REPORT_IDS);
    expect(sanitizeReportPrefs({ visible: ['debtors', 'zzz', 'yearly'] }).visible).toEqual(['yearly', 'debtors']);
  });
  it('خاموش/روشن؛ آخرین گزارش روشن خاموش نمی‌شود', () => {
    let p = DEFAULT_REPORT_PREFS;
    for (const id of REPORT_IDS.slice(1)) p = setReportVisible(p, id, false);
    expect(p.visible).toEqual([REPORT_IDS[0]]);
    expect(setReportVisible(p, REPORT_IDS[0], false).visible).toEqual([REPORT_IDS[0]]);
    p = setReportVisible(p, 'charts', true);
    expect(p.visible).toEqual(['yearly', 'charts']);
    expect(isReportVisible(p, 'charts')).toBe(true);
    expect(isReportVisible(p, 'debtors')).toBe(false);
    expect(visibleReports(p).map((r) => r.id)).toEqual(['yearly', 'charts']);
  });
  it('تصادفی: همیشه دست‌کم یکی روشن و فقط شناسه‌های معتبر', () => {
    let a = 99; const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    let p = DEFAULT_REPORT_PREFS;
    for (let i = 0; i < 500; i++) {
      p = setReportVisible(p, REPORT_IDS[Math.floor(rnd() * 6)], rnd() < 0.5);
      expect(p.visible.length).toBeGreaterThanOrEqual(1);
      expect(p.visible.every(isReportId)).toBe(true);
      expect(sanitizeReportPrefs(p)).toEqual(p);
    }
  });
  it('گزارش خاموشِ باز (پیوند قدیمی) ← اولین گزارش روشن', () => {
    const p = { visible: ['debtors' as const] };
    expect(resolveReport(p, 'charts')).toBe('debtors');
    expect(resolveReport(p, 'debtors')).toBe('debtors');
  });
});

describe('ذخیره', () => {
  beforeEach(() => mem.clear());
  it('کلید جدا در kvStore؛ خارج از پشتیبان؛ مقدار خراب ← همه روشن', async () => {
    expect(await reportPrefsRepository.get()).toEqual(DEFAULT_REPORT_PREFS);
    await reportPrefsRepository.save({ visible: ['charts', 'yearly'] });
    expect(JSON.parse(mem.get('reportPrefs')!)).toEqual({ visible: ['yearly', 'charts'] });
    expect((await reportPrefsRepository.get()).visible).toEqual(['yearly', 'charts']);
    expect(JSON.stringify(await backupRepository.collect())).not.toContain('reportPrefs');
    expect(serializeBackup(createBackup(await backupRepository.collect(), '1.7.0'))).not.toContain('reportPrefs');
    mem.set('reportPrefs', '"junk"');
    expect(await reportPrefsRepository.get()).toEqual(DEFAULT_REPORT_PREFS);
  });
});

describe('صفحهٔ فهرست گزارش‌ها (hub)', () => {
  const html = (visible: Parameters<typeof sanitizeReportPrefs>[0]) => renderToStaticMarkup(createElement(ReportsHub, { prefs: sanitizeReportPrefs(visible), onOpen: () => undefined }));
  it('همه روشن: شش ردیف در دو گروه با نشان «جدید» برای سه گزارش جدید', () => {
    const h = html(undefined);
    expect(h.match(/class="hub-row"/g)).toHaveLength(6);
    for (const r of REPORTS) { expect(h).toContain(`data-report="${r.id}"`); expect(h).toContain(r.title); }
    expect(h.match(/hub-new/g)).toHaveLength(3);
    expect(h).toContain('هزینه‌ها و جمع‌ها');
    expect(h).toContain('پرداخت و بدهی');
  });
  it('گزارش خاموش در فهرست نیست؛ اگر گروهی خالی شود عنوانش هم نیست', () => {
    const h = html({ visible: ['yearly', 'monthly', 'monthlyDetail'] });
    expect(h.match(/class="hub-row"/g)).toHaveLength(3);
    expect(h).not.toContain('data-report="debtors"');
    expect(h).not.toContain('data-report="charts"');
    expect(h).not.toContain('پرداخت و بدهی');
    expect(h).toContain('هزینه‌ها و جمع‌ها');
  });
});

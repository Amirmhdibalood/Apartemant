import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bill } from '../src/models/types';
import { alertChipText, bannerFor, groupAlerts, selectDueAlerts, withoutDismissed } from '../src/logic/dueAlerts';
import { DEFAULT_NOTIF_MODE, NOTIF_MODES, sanitizeNotifMode } from '../src/logic/notifMode';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { notifModeRepository } = await import('../src/storage/notifModeRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { billRepository } = await import('../src/storage/billRepository');

const TODAY = { year: 1405, month: 7, day: 11 };
const bill = (id: string, dueDate: string, over: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate, deletedAt: null, ...over,
});
const sample = () => selectDueAlerts([
  bill('o3', '1405-07-08', { expenseType: 'repairs' }), bill('o1', '1405-07-10', { expenseType: 'electricity' }),
  bill('d0', '1405-07-11'), bill('d1', '1405-07-12', { expenseType: 'water' }),
  bill('d2a', '1405-07-13', { expenseType: 'cleaning' }), bill('d2b', '1405-07-13', { expenseType: 'building' }),
  bill('far', '1405-07-14'),
], TODAY);

describe('مرکز اعلان‌ها: گروه‌بندی و نشان‌ها', () => {
  it('اعلان‌ها از ۲ روز قبل شروع می‌شوند و به ترتیب گذشته، امروز، فردا، ۲ روز دیگر گروه‌بندی می‌شوند', () => {
    const all = sample();
    expect(all.map((a) => a.billId)).toEqual(['o3', 'o1', 'd0', 'd1', 'd2a', 'd2b']);
    const groups = groupAlerts(all);
    expect(groups.map((g) => [g.kind, g.title, g.items.length])).toEqual([
      ['overdue', 'سررسید گذشته', 2], ['today', 'امروز', 1], ['tomorrow', 'فردا', 1], ['in2days', 'دو روز دیگر', 2],
    ]);
    expect(groupAlerts([])).toEqual([]);
    expect(groupAlerts(all.filter((a) => a.kind === 'today')).map((g) => g.kind)).toEqual(['today']);
  });
  it('نشان کوتاه هر اعلان', () => {
    const chips = sample().map(alertChipText);
    expect(chips).toEqual(['۳ روز گذشته', '۱ روز گذشته', 'امروز', 'فردا', '۲ روز دیگر', '۲ روز دیگر']);
  });
  it('بستن بنر اعلان زنگوله را حذف نمی‌کند؛ با پرداخت یا حذف قبض اعلان می‌رود', () => {
    const all = sample();
    const dismissed = new Set(all.map((a) => a.key));
    expect(withoutDismissed(all, dismissed)).toHaveLength(0); // بنر خالی
    expect(all).toHaveLength(6); // زنگوله و عدد همچنان ۶
    const paid = selectDueAlerts([bill('o3', '1405-07-08', { billPaid: true, billPaidDate: '1405-07-10' }), bill('x', '1405-07-12', { deletedAt: '2026-10-03T00:00:00.000Z' })], TODAY);
    expect(paid).toEqual([]);
  });
});

describe('بنر صفحه اصلی بر اساس حالت نمایش', () => {
  it('«پنجره پایین»: فقط فوری‌ترین مورد + تعداد بقیه', () => {
    const all = sample();
    const r = bannerFor(all, 'sheet');
    expect(r.shown.map((a) => a.billId)).toEqual(['o3']);
    expect(r.more).toBe(5);
  });
  it('«پنجره پایین» با یک مورد: بدون «اعلان دیگر»؛ «پنل کشویی»: همه کارت‌ها مثل قبل', () => {
    const all = sample();
    expect(bannerFor(all.slice(0, 1), 'sheet')).toEqual({ shown: all.slice(0, 1), more: 0 });
    expect(bannerFor([], 'sheet')).toEqual({ shown: [], more: 0 });
    expect(bannerFor(all, 'dropdown')).toEqual({ shown: all, more: 0 });
  });
});

describe('تنظیم «نحوه نمایش اعلان‌ها»', () => {
  beforeEach(() => mem.clear());
  it('پیش‌فرض پنجره پایین؛ مقدار نامعتبر نادیده گرفته می‌شود', async () => {
    expect(DEFAULT_NOTIF_MODE).toBe('sheet');
    expect(NOTIF_MODES.map((m) => m.id)).toEqual(['sheet', 'dropdown']);
    expect(NOTIF_MODES.map((m) => m.label)).toEqual(['پنجره پایین', 'پنل کشویی']);
    expect(sanitizeNotifMode('page')).toBeNull();
    expect(sanitizeNotifMode(7)).toBeNull();
    expect(await notifModeRepository.get()).toBe('sheet');
    mem.set('notifMode', JSON.stringify('page'));
    expect(await notifModeRepository.get()).toBe('sheet');
  });
  it('انتخاب ماندگار می‌شود و داخل فایل پشتیبان نیست و بازیابی آن را عوض نمی‌کند', async () => {
    await notifModeRepository.save('dropdown');
    expect(await notifModeRepository.get()).toBe('dropdown');
    const backup = await backupRepository.collect();
    expect(JSON.stringify(backup)).not.toMatch(/notifMode|dropdown/);
    await billRepository.getAll();
    expect(await notifModeRepository.get()).toBe('dropdown');
  });
});

describe('زنگوله در نوار بالا و بدون مجوز', () => {
  it('زنگوله (اعلان) کنار «پشتیبانی» در هدر صفحات و در نوار بالای خانه است', async () => {
    const { NotifProvider } = await import('../src/context/NotifContext');
    const { ThemeProvider } = await import('../src/context/ThemeContext');
    const { AppHeader } = await import('../src/components/AppHeader');
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(NotifProvider, null, createElement(AppHeader, { title: 'گزارش‌ها', onSupport: () => undefined }))),
    );
    expect(html).toContain('bell-btn');
    expect(html.indexOf('bell-btn')).toBeLessThan(html.indexOf('support-btn')); // DOM برعکس: روی صفحه از چپ پشتیبانی ← زنگوله
    expect(html).not.toContain('help-btn');
    expect(html).toContain('aria-label="اعلان‌ها"');
    expect(readFileSync('src/screens/HomeScreen.tsx', 'utf8')).toMatch(/home-topbar"><NotifBell \/><SupportButton onSupport=\{onSupport\} \/><ThemeToggle \/>/);
  });
  it('هیچ مجوز یا افزونه اعلان سیستمی اضافه نشده', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /notification/i.test(d))).toBe(false);
  });
});

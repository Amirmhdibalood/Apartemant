import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Bill } from '../src/models/types';
import { ALERT_DAYS_BEFORE, dueAlertFor, dueAlertText, selectDueAlerts, withoutDismissed } from '../src/logic/dueAlerts';
import { pathToFileURL } from 'node:url';

const TODAY = { year: 1405, month: 7, day: 6 };
const bill = (id: string, over: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...over,
});

describe('هشدار مهلت پرداخت داخل برنامه (صفحه اصلی)', () => {
  it('فردا / امروز / گذشته با متن درست', () => {
    expect(ALERT_DAYS_BEFORE).toBe(1);
    expect(dueAlertFor(bill('a', { dueDate: '1405-07-07' }), TODAY)).toMatchObject({ kind: 'tomorrow', text: 'فردا مهلت پرداخت قبض گاز (مهر ۱۴۰۵) است' });
    expect(dueAlertFor(bill('a', { dueDate: '1405-07-06' }), TODAY)).toMatchObject({ kind: 'today', text: 'امروز آخرین مهلت پرداخت قبض گاز (مهر ۱۴۰۵) است' });
    expect(dueAlertFor(bill('a', { dueDate: '1405-06-30', expenseType: 'water', month: 6 }), TODAY))
      .toMatchObject({ kind: 'overdue', overdueDays: 7, text: 'مهلت پرداخت قبض آب (شهریور ۱۴۰۵) ۷ روز گذشته است' });
    expect(dueAlertText({ expenseType: 'electricity', month: 12, year: 1404 }, 'tomorrow')).toBe('فردا مهلت پرداخت قبض برق (اسفند ۱۴۰۴) است');
  });

  it('برای پرداخت‌شده، حذف‌شده، بدون مهلت یا مهلت دورتر از فردا هشداری نیست', () => {
    expect(dueAlertFor(bill('a', { dueDate: '1405-07-06', billPaid: true, billPaidDate: '1405-07-05' }), TODAY)).toBeNull();
    expect(dueAlertFor(bill('a', { dueDate: '1405-07-01', deletedAt: '2026-09-27T08:00:00.000Z' }), TODAY)).toBeNull();
    expect(dueAlertFor(bill('a'), TODAY)).toBeNull();
    expect(dueAlertFor(bill('a', { dueDate: '1405-07-08' }), TODAY)).toBeNull(); // ۲ روز مانده
  });

  it('ترتیب: بیشترین روز گذشته اول، بعد امروز، بعد فردا؛ عبور از مرز سال', () => {
    const r = selectDueAlerts([
      bill('t', { dueDate: '1405-07-07' }),
      bill('o1', { dueDate: '1405-07-04' }),
      bill('d', { dueDate: '1405-07-06' }),
      bill('far', { dueDate: '1405-07-20' }),
      bill('o9', { dueDate: '1405-06-28' }),
      bill('p', { dueDate: '1405-07-01', billPaid: true, billPaidDate: '1405-07-02' }),
    ], TODAY);
    expect(r.map((a) => a.billId)).toEqual(['o9', 'o1', 'd', 't']);
    expect(dueAlertFor(bill('y', { year: 1404, month: 12, dueDate: '1405-01-01' }), { year: 1404, month: 12, day: 29 })?.kind).toBe('tomorrow');
  });

  it('بستن کارت فقط در همین اجرا؛ کلید با مهلت عوض می‌شود تا با تغییر مهلت دوباره نمایش داده شود', () => {
    const alerts = selectDueAlerts([bill('a', { dueDate: '1405-07-06' }), bill('b', { dueDate: '1405-07-07' })], TODAY);
    const dismissed = new Set([alerts[0].key]);
    expect(withoutDismissed(alerts, dismissed).map((a) => a.billId)).toEqual(['b']);
    expect(withoutDismissed(alerts, new Set()).map((a) => a.billId)).toEqual(['a', 'b']); // اجرای بعدی برنامه
    const moved = selectDueAlerts([bill('a', { dueDate: '1405-07-07' })], TODAY);
    expect(withoutDismissed(moved, dismissed)).toHaveLength(1);
  });
});

describe('بدون اعلان سیستمی و بدون مجوز', () => {
  const root = path.resolve(__dirname, '..');
  it('افزونه اعلان محلی در وابستگی‌ها نیست', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /notification/i.test(d))).toBe(false);
    const src = fs.readdirSync(path.join(root, 'src'), { recursive: true }) as string[];
    for (const f of src.filter((x) => /\.(ts|tsx)$/.test(x))) {
      expect(fs.readFileSync(path.join(root, 'src', f), 'utf8')).not.toMatch(/local-notifications|LocalNotifications|requestPermissions/);
    }
  });
  it('مجوزهای اعلان، هشدار دقیق و اینترنت از Manifest نهایی حذف می‌شوند', async () => {
    const url = pathToFileURL(path.resolve(__dirname, '../scripts/manifest-permissions.mjs')).href;
    const { REMOVED_PERMISSIONS, stripNetworkPermissions } = (await import(/* @vite-ignore */ url)) as {
      REMOVED_PERMISSIONS: string[]; stripNetworkPermissions: (xml: string) => string;
    };
    for (const p of ['INTERNET', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM']) {
      expect(REMOVED_PERMISSIONS).toContain(`android.permission.${p}`);
    }
    const xml = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>';
    const out = stripNetworkPermissions(xml);
    expect(out).toContain('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" tools:node="remove" />');
    expect(out).not.toMatch(/POST_NOTIFICATIONS" \/>/);
    expect(stripNetworkPermissions(out)).toBe(out);
  });
});

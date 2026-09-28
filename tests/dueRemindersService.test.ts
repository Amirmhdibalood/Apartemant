import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bill, Unit } from '../src/models/types';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
const ln = vi.hoisted(() => ({
  display: 'granted' as string,
  pending: [] as { id: number }[],
  scheduled: [] as { id: number; body: string; schedule: { at: Date; allowWhileIdle: boolean }; channelId: string }[][],
  cancelled: [] as number[][],
  requested: 0,
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: async () => ({ display: ln.display }),
    requestPermissions: async () => { ln.requested++; ln.display = 'granted'; return { display: 'granted' }; },
    createChannel: async () => undefined,
    getPending: async () => ({ notifications: ln.pending }),
    cancel: async ({ notifications }: { notifications: { id: number }[] }) => { ln.cancelled.push(notifications.map((x) => x.id)); ln.pending = []; },
    schedule: async ({ notifications }: { notifications: typeof ln.scheduled[number] }) => {
      ln.scheduled.push(notifications); ln.pending = notifications.map((x) => ({ id: x.id }));
    },
  },
}));

const { billRepository } = await import('../src/storage/billRepository');
const { ensureReminderPermission, startDueReminderSync, syncDueReminders } = await import('../src/services/dueReminders');
const { reminderIdFor } = await import('../src/logic/dueReminders');
const { addJalaliDays, formatJalaliKey, todayJalali } = await import('../src/logic/jalali');

const inDays = (d: number) => formatJalaliKey(addJalaliDays(todayJalali(), d));
const bill = (id: string, over: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...over,
});
const units = (billId: string): Unit[] => [{ id: `${billId}-1`, billId, unitNumber: 1, personCount: 1, shareAmount: 900000, isSettled: false }];

describe('زمان‌بندی اعلان‌های یادآوری (سرویس با افزونه شبیه‌سازی‌شده)', () => {
  beforeEach(() => {
    mem.clear(); billRepository._resetCache();
    Object.assign(ln, { display: 'granted', pending: [], scheduled: [], cancelled: [], requested: 0 });
  });

  it('فقط قبض‌های پرداخت‌نشده و حذف‌نشده با مهلت آینده؛ غیردقیق؛ اعلان‌های قبلی لغو می‌شوند', async () => {
    await billRepository.replaceAll([
      bill('due', { dueDate: inDays(5) }),
      bill('paid', { dueDate: inDays(5), billPaid: true, billPaidDate: inDays(0) }),
      bill('deleted', { dueDate: inDays(5), deletedAt: new Date().toISOString() }),
      bill('nodue'),
      bill('past', { dueDate: inDays(-2) }),
    ], [...units('due'), ...units('paid')]);
    ln.pending = [{ id: 111 }, { id: 222 }];
    await syncDueReminders();
    expect(ln.cancelled).toEqual([[111, 222]]);
    expect(ln.scheduled).toHaveLength(1);
    const [n] = ln.scheduled[0];
    expect(ln.scheduled[0]).toHaveLength(1);
    expect(n.id).toBe(reminderIdFor('due'));
    expect(n.channelId).toBe('due-reminders');
    expect(n.schedule.allowWhileIdle).toBe(false);
    expect(n.schedule.at.getHours()).toBe(9);
    expect(n.schedule.at.getTime()).toBeGreaterThan(Date.now());
    expect(n.body).toMatch(/^یادآوری: فردا مهلت پرداخت قبض گاز \(مهر ۱۴۰۵\) است$/);
  });

  it('هر تغییر قبض (پرداخت شد / حذف / بازگردانی / بازیابی) باعث زمان‌بندی دوباره می‌شود', async () => {
    const stop = startDueReminderSync();
    await syncDueReminders();
    await billRepository.upsert(bill('a', { dueDate: inDays(4) }), units('a'));
    await syncDueReminders();
    expect(ln.pending.map((x) => x.id)).toEqual([reminderIdFor('a')]);

    await billRepository.upsert(bill('a', { dueDate: inDays(4), billPaid: true, billPaidDate: inDays(0) }), units('a'));
    await syncDueReminders();
    expect(ln.pending).toEqual([]); // پرداخت شد → یادآوری لغو

    await billRepository.upsert(bill('a', { dueDate: inDays(4) }), units('a'));
    await billRepository.remove('a');
    await syncDueReminders();
    expect(ln.pending).toEqual([]); // حذف‌شده → یادآوری لغو

    await billRepository.restore('a');
    await syncDueReminders();
    expect(ln.pending.map((x) => x.id)).toEqual([reminderIdFor('a')]);

    await billRepository.replaceAll([bill('r', { dueDate: inDays(9) })], units('r')); // بازیابی پشتیبان
    await syncDueReminders();
    expect(ln.pending.map((x) => x.id)).toEqual([reminderIdFor('r')]);
    stop();
  });

  it('بدون مجوز اعلانی زمان‌بندی نمی‌شود؛ درخواست مجوز فقط وقتی هنوز پرسیده نشده', async () => {
    await billRepository.replaceAll([bill('a', { dueDate: inDays(4) })], units('a'));
    ln.display = 'denied';
    await syncDueReminders();
    expect(ln.scheduled).toHaveLength(0);
    expect(await ensureReminderPermission()).toBe(false);
    expect(ln.requested).toBe(0);
    ln.display = 'prompt';
    expect(await ensureReminderPermission()).toBe(true);
    expect(ln.requested).toBe(1);
    await syncDueReminders();
    expect(ln.scheduled).toHaveLength(1);
  });
});

import { resetIdbForTests } from '../src/storage/idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupData } from '../src/logic/backup';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));

const { onboardingRepository } = await import('../src/storage/onboardingRepository');
const { billRepository } = await import('../src/storage/billRepository');
const { backupRepository } = await import('../src/storage/backupRepository');

describe('آموزش اجرای اول', () => {
  beforeEach(async () => { mem.clear(); billRepository._resetCache(); await resetIdbForTests(); (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem.clear(); });

  it('نصب تازه: فقط یک‌بار true', async () => {
    expect(await onboardingRepository.consumeFirstRun()).toBe(true);
    expect(await onboardingRepository.consumeFirstRun()).toBe(false);
    expect(await onboardingRepository.consumeFirstRun()).toBe(false);
  });

  it('به‌روزرسانی از نسخه قبلی (قبض ذخیره‌شده دارد): آموزش خودکار نمایش داده نمی‌شود', async () => {
    await billRepository.replaceAll(
      [{ id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000, createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null }],
      [],
    );
    expect(await onboardingRepository.consumeFirstRun()).toBe(false);
    expect(mem.get('tutorialSeen')).toBe('true');
  });

  it('بازیابی پشتیبان پرچم را دست نمی‌زند: بعد از اولین اجرا دوباره آموزش باز نمی‌شود', async () => {
    expect(await onboardingRepository.consumeFirstRun()).toBe(true);
    const data: BackupData = {
      bills: [{ id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000, createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null }],
      units: [{ id: 'u1', billId: 'b1', unitNumber: 1, personCount: 1, shareAmount: 1000, isSettled: false }],
      settings: { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] },
      building: { units: [{ alias: null, defaultPersons: 1 }] },
    };
    await backupRepository.replaceAll(data);
    expect(await onboardingRepository.consumeFirstRun()).toBe(false);
    expect([...mem.keys()].filter((k) => k.includes('tutorial'))).toEqual(['tutorialSeen']);
  });

  it('پرچم داخل فایل پشتیبان نیست', async () => {
    await onboardingRepository.consumeFirstRun();
    const data = await backupRepository.collect();
    expect(JSON.stringify(data)).not.toContain('tutorialSeen');
  });
});

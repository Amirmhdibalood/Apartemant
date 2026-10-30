import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests } from '../src/storage/sqlite/db';
import { buildingRepository } from '../src/storage/buildingRepository';
import { billRepository } from '../src/storage/billRepository';
import { planManagerSwap, submitNewManager, type ManagerSwapPlan, type NewManagerInput } from '../src/logic/managerSwap';
import { hasOpenManagementPeriod } from '../src/logic/billGate';
import { ManagerSwapDialog } from '../src/components/ManagerSwapDialog';
import type { ManagementPeriodRow } from '../src/storage/sqlite/domain';
import { HELP_TOPICS } from '../src/content/help';
import { readFileSync } from 'node:fs';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

const TODAY = '1405-08-08';
const period = (p: Partial<ManagementPeriodRow>): ManagementPeriodRow => ({
  id: 'p1', buildingId: 'b', managerLabel: 'آقای رضایی', startDate: '1405-01-01', endDate: '1405-12-29', endedEarlyAt: null, notes: null, ...p,
});
const NEW: NewManagerInput = { managerLabel: 'خانم احمدی', startDate: '1405-08-08', endDate: '1406-08-07' };

const save = (input: NewManagerInput) => buildingRepository.addManagementPeriod({ ...input, endPreviousEarly: true });
const run = async (answer: boolean) => {
  const asked: ManagerSwapPlan[] = [];
  const result = await submitNewManager(NEW, {
    periods: await buildingRepository.listManagementPeriods(),
    todayKey: TODAY,
    confirm: async (plan) => { asked.push(plan); return answer; },
    save,
  });
  return { result, asked };
};

describe('تعریف مدیر جدید وقتی مدیر فعال هست', () => {
  it('دیالوگ فقط وقتی دورهٔ باز (امروز) هست', () => {
    expect(planManagerSwap([], TODAY, NEW)).toBeNull();
    expect(planManagerSwap([period({ endDate: '1405-06-31' })], TODAY, NEW)).toBeNull();
    expect(planManagerSwap([period({ endedEarlyAt: '2026-05-01T00:00:00.000Z' })], TODAY, NEW)).toBeNull();
    expect(planManagerSwap([period({ startDate: '1405-09-01' })], TODAY, NEW)).toBeNull();
    const plan = planManagerSwap([period({ endDate: '1405-06-31', id: 'old' }), period({ id: 'open' })], TODAY, NEW);
    expect(plan).toEqual({ current: expect.objectContaining({ id: 'open', managerLabel: 'آقای رضایی' }), closeDate: TODAY, newLabel: 'خانم احمدی', newStart: '1405-08-08' });
  });

  it('بدون دورهٔ باز: مستقیم ذخیره، بدون پرسش', async () => {
    const { result, asked } = await run(false);
    expect(result).toBe('saved');
    expect(asked).toHaveLength(0);
    const rows = await buildingRepository.listManagementPeriods();
    expect(rows.map((r) => r.managerLabel)).toEqual(['خانم احمدی']);
  });

  it('انصراف («ادامه با مدیر فعلی»): هیچ چیز ذخیره نمی‌شود، مدیر قبلی باز می‌ماند', async () => {
    await buildingRepository.addManagementPeriod({ managerLabel: 'آقای رضایی', startDate: '1405-01-01', endDate: '1405-12-29' });
    const { result, asked } = await run(false);
    expect(result).toBe('cancelled');
    expect(asked).toHaveLength(1);
    expect(asked[0].current.managerLabel).toBe('آقای رضایی');
    const rows = await buildingRepository.listManagementPeriods();
    expect(rows).toHaveLength(1);
    expect(rows[0].endedEarlyAt).toBeNull();
    expect(hasOpenManagementPeriod(rows, TODAY)).toBe(true);
  });

  it('تأیید: دورهٔ قبلی بسته (زودهنگام) و مدیر جدید ثبت می‌شود', async () => {
    await buildingRepository.addManagementPeriod({ managerLabel: 'آقای رضایی', startDate: '1405-01-01', endDate: '1405-12-29' });
    const { result, asked } = await run(true);
    expect(result).toBe('saved');
    expect(asked).toHaveLength(1);
    const rows = await buildingRepository.listManagementPeriods();
    expect(rows).toHaveLength(2);
    const old = rows.find((r) => r.managerLabel === 'آقای رضایی')!;
    const neu = rows.find((r) => r.managerLabel === 'خانم احمدی')!;
    expect(old.endedEarlyAt).not.toBeNull();
    expect(old.endDate).toBe('1405-12-29');
    expect(neu.endedEarlyAt).toBeNull();
    expect(neu.startDate).toBe('1405-08-08');
    expect(rows.filter((r) => hasOpenManagementPeriod([r], TODAY)).map((r) => r.managerLabel)).toEqual(['خانم احمدی']);
  });

  it('متن و دکمه‌های دیالوگ مطابق موکاپ تأییدشده', () => {
    expect(renderToStaticMarkup(createElement(ManagerSwapDialog, { plan: null, onResult: () => undefined }))).toBe('');
    const html = renderToStaticMarkup(createElement(ManagerSwapDialog, {
      plan: { current: period({}), closeDate: TODAY, newLabel: 'خانم احمدی', newStart: '1405-08-08' },
      onResult: () => undefined,
    }));
    for (const t of ['این ساختمان مدیر فعال دارد', 'دورهٔ مدیریت فعلی بسته می‌شود', 'مدیر فعلی', 'بسته می‌شود', 'امروز', 'مدیر جدید',
      'آقای رضایی', 'خانم احمدی', 'از ۱۴۰۵/۰۱/۰۱', '۱۴۰۵/۰۸/۰۸', 'بستن دوره و تعریف مدیر جدید', 'ادامه با مدیر فعلی']) {
      expect(html).toContain(t);
    }
    expect(html.indexOf('btn btn--primary')).toBeLessThan(html.indexOf('btn btn--muted'));
    expect(html).toContain('dialog__actions--stack');
  });

  it('CSS دیالوگ فقط با متغیرهای تم (بدون رنگ ثابت)', () => {
    const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
    const rules = [...css.matchAll(/^\.(?:mgr-swap[^{]*|dialog__icon--swap|dialog__actions--stack[^{]*)\{[^}]*\}/gm)].map((m) => m[0]);
    expect(rules.length).toBeGreaterThanOrEqual(8);
    for (const r of rules) expect(r).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('آموزش: توضیح پیام مدیر فعال', () => {
    const t = HELP_TOPICS.find((x) => x.id === 'management')!;
    const all = [...t.steps, ...(t.qa ?? []).flatMap((x) => [x.q, x.a])].join(' ');
    expect(all).toContain('این ساختمان مدیر فعال دارد');
    expect(all).toContain('ادامه با مدیر فعلی');
  });
});

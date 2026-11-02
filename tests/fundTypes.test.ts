/**
 * صندوق: انتخاب «قبض‌های واریزی به صندوق» (قالب پشتیبان ۱۰).
 * قانون مالک: تصمیم لحظهٔ ثبت پرداخت؛ گردش قبلی هرگز عوض نمی‌شود؛ حذف پرداخت فقط واریز خودش را پاک می‌کند.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { backupRepository } from '../src/storage/backupRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import { BACKUP_VERSION, createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import {
  FUND_HINT_FUTURE_ONLY, fundHintText, fundReasonFa, fundTypeRows, parseFundTypesJson, sanitizeFundTypes, toggleFundType,
} from '../src/logic/fundTypes';
import { FundTypesPicker } from '../src/components/FundTypesPicker';
import { HELP_TOPICS } from '../src/content/help';
import type { Bill, ExpenseType, Payment, Unit } from '../src/models/types';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;
beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

const bill = (id: string, expenseType: ExpenseType, extra: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType, billNumber: null, description: null, totalAmount: 10_000,
  createdAt: '2026-01-01T00:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
});
const unit = (billId: string, payments: Payment[]): Unit => ({
  id: `${billId}-u1`, billId, unitNumber: 1, personCount: 2, shareAmount: 10_000, isSettled: false, payments,
});
const pay = (id: string, amount: number, day = 1): Payment => ({ id, amount, paidAt: `2026-02-0${day}T00:00:00.000Z` });

/** ثبت پرداخت(ها) روی قبض = upsert با فهرست کامل پرداخت‌ها (همان کاری که صفحهٔ پرداخت می‌کند) */
const save = (b: Bill, payments: Payment[]) => billRepository.upsert(b, [unit(b.id, payments)]);
const deposits = async () => (await buildingRepository.listFundEntries()).filter((e) => e.kind === 'deposit');
const balance = () => buildingRepository.getFundBalance();

describe('قبض‌های واریزی به صندوق — قانون‌ها', () => {
  it('پیش‌فرض: فقط شارژ ساختمان (ساختمان تازه و ساختمان اصلی)', async () => {
    expect(await buildingRepository.getFundTypes()).toEqual(['building']);
    const b2 = await buildingRepository.create('دوم', false);
    expect(await buildingRepository.getFundTypes(b2)).toEqual(['building']);
    await buildingRepository.setFundEnabled(true);
    await save(bill('c', 'building'), [pay('p1', 3000)]);
    await save(bill('w', 'water'), [pay('p2', 2000)]);
    expect(await balance()).toBe(3000);
    const [d] = await deposits();
    expect(d.relatedPaymentId).toBe('p1');
    expect(fundReasonFa(d.reason, d.kind, d.billExpenseType)).toBe('واریز از پرداخت قبض شارژ ساختمان');
  });

  it('تیک یک نوع فقط روی پرداخت‌های بعدی اثر دارد', async () => {
    await buildingRepository.setFundEnabled(true);
    const w = bill('w', 'water');
    await save(w, [pay('old', 1000)]);
    expect(await balance()).toBe(0);
    await buildingRepository.setFundTypes(['building', 'water']);
    // ویرایش قبض (بدون پرداخت تازه): پرداخت قدیمی به صندوق نمی‌رود
    await save({ ...w, description: 'ویرایش' }, [pay('old', 1000)]);
    expect(await balance()).toBe(0);
    // پرداخت تازه → واریز
    await save(w, [pay('old', 1000), pay('new', 2500, 2)]);
    expect(await balance()).toBe(2500);
    const d = await deposits();
    expect(d.map((x) => x.relatedPaymentId)).toEqual(['new']);
    expect(fundReasonFa(d[0].reason, d[0].kind, d[0].billExpenseType)).toBe('واریز از پرداخت قبض آب');
  });

  it('واریزهای قبلی با برداشتن تیک، خاموش‌کردن صندوق یا ویرایش قبض عوض نمی‌شوند', async () => {
    await buildingRepository.setFundEnabled(true);
    const c = bill('c', 'building');
    await save(c, [pay('p1', 4000)]);
    const before = await deposits();
    expect(before).toHaveLength(1);

    await buildingRepository.setFundTypes([]);
    await save({ ...c, description: 'ویرایش ۱' }, [pay('p1', 4000)]);
    await save(c, [pay('p1', 4000), pay('p2', 1000, 2)]); // پرداخت تازه وقتی شارژ تیک ندارد → واریز ندارد
    expect(await deposits()).toEqual(before);

    await buildingRepository.setFundEnabled(false);
    await save({ ...c, description: 'ویرایش ۲' }, [pay('p1', 4000), pay('p2', 1000, 2)]);
    await buildingRepository.setFundEnabled(true);
    expect(await deposits()).toEqual(before);
    expect(await balance()).toBe(4000);
  });

  it('حذف یک پرداخت فقط واریز همان پرداخت را پاک می‌کند', async () => {
    await buildingRepository.setFundEnabled(true);
    const c = bill('c', 'building');
    await save(c, [pay('p1', 1000), pay('p2', 2000, 2), pay('p3', 3000, 3)]);
    expect(await balance()).toBe(6000);
    await buildingRepository.addFundWithdraw(500, 'لامپ');
    await save(c, [pay('p1', 1000), pay('p3', 3000, 3)]);
    expect((await deposits()).map((d) => d.relatedPaymentId).sort()).toEqual(['p1', 'p3']);
    expect(await balance()).toBe(3500);
  });

  it('خاموش و روشن کردن صندوق انتخاب قبلی را نگه می‌دارد؛ انتخاب برای هر ساختمان جداست', async () => {
    const b2 = await buildingRepository.create('دوم', false);
    await buildingRepository.setFundEnabled(true);
    await buildingRepository.setFundTypes(['repairs', 'building']);
    await buildingRepository.setFundEnabled(false);
    await buildingRepository.setFundEnabled(true);
    expect(await buildingRepository.getFundTypes()).toEqual(['building', 'repairs']);
    expect(await buildingRepository.getFundTypes(b2)).toEqual(['building']);
  });

  it('واریزهای قدیمی «charge_bill» (قبل از این نسخه) دست نمی‌خورند و عنوانشان درست است', async () => {
    expect(fundReasonFa('charge_bill', 'deposit', null)).toBe('واریز از پرداخت قبض شارژ ساختمان');
    expect(fundReasonFa('manual', 'deposit')).toBe('واریز دستی');
    expect(fundReasonFa('expense', 'withdraw')).toBe('برداشت / هزینه');
  });
});

describe('پشتیبان قالب ۱۰', () => {
  it('رفت‌وبرگشت: انتخاب هر ساختمان سر جایش برمی‌گردد', async () => {
    const b2 = await buildingRepository.create('دوم', false);
    await buildingRepository.setFundEnabled(true);
    await buildingRepository.setFundTypes(['water', 'gas']);
    await buildingRepository.setFundTypes([], b2);
    const text = serializeBackup(createBackup(await backupRepository.collect(), '1.8.0'));
    const json = JSON.parse(text);
    expect(json.backupVersion).toBe(11);
    expect(BACKUP_VERSION).toBe(11);
    expect(json.data.buildings.map((b: { fundTypes: string[] }) => b.fundTypes)).toEqual([['water', 'gas'], []]);

    prefs().clear(); billRepository._resetCache(); await resetIdbForTests(); await resetSqliteForTests();
    const r = parseBackup(text);
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    expect(await buildingRepository.getFundTypes(DEFAULT_BUILDING_ID)).toEqual(['water', 'gas']);
    expect(await buildingRepository.getFundTypes(b2)).toEqual([]);
  });

  it('پشتیبان قالب ۹ (بدون fundTypes) = فقط شارژ ساختمان', async () => {
    const b2 = await buildingRepository.create('دوم', false);
    await buildingRepository.setFundTypes(['water'], b2);
    const json = JSON.parse(serializeBackup(createBackup(await backupRepository.collect(), '1.8.0')));
    json.backupVersion = 9;
    for (const b of json.data.buildings) delete b.fundTypes;
    const r = parseBackup(JSON.stringify(json));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.buildings!.map((b) => b.fundTypes)).toEqual([['building'], ['building']]);
    await backupRepository.replaceAll(r.backup.data);
    expect(await buildingRepository.getFundTypes(b2)).toEqual(['building']);
  });

  it('fundTypes دستکاری‌شده رد می‌شود', async () => {
    const json = JSON.parse(serializeBackup(createBackup(await backupRepository.collect(), '1.8.0')));
    for (const bad of [['constructor'], 'building', [1], ['__proto__'], Array(20).fill('water')]) {
      json.data.buildings[0].fundTypes = bad;
      const r = parseBackup(JSON.stringify(json));
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('منطق و نمایش', () => {
  it('پاک‌سازی و JSON ستون', () => {
    expect(sanitizeFundTypes(['misc', 'building', 'misc'])).toEqual(['building', 'misc']);
    expect(sanitizeFundTypes(['x'])).toBeNull();
    expect(parseFundTypesJson('garbage')).toEqual(['building']);
    expect(parseFundTypesJson('[]')).toEqual([]);
  });

  it('فهرست = نوع‌های روشن در «انواع قبض و روش‌ها» (+ نوع تیک‌خورده‌ای که بعداً خاموش شده)', () => {
    expect(fundTypeRows(['water', 'building', 'gas'], ['building'])).toEqual(['building', 'water', 'gas']);
    expect(fundTypeRows(['water'], ['building'])).toEqual(['building', 'water']);
    expect(toggleFundType(['building'], 'repairs')).toEqual(['building', 'repairs']);
    expect(toggleFundType(['building', 'repairs'], 'building')).toEqual(['repairs']);
  });

  it('متن راهنما برای هر حالت (موکاپ ۰۹)', () => {
    expect(fundHintText(['building'])).toBe('با هر پرداخت روی قبض «شارژ ساختمان»، همان مبلغ به صندوق واریز می‌شود. بقیهٔ قبض‌ها به صندوق نمی‌روند.');
    expect(fundHintText(['building', 'repairs', 'beautification'])).toBe('با هر پرداخت روی قبض‌های «شارژ ساختمان»، «تعمیرات» و «زیبایی ساختمان»، همان مبلغ به صندوق واریز می‌شود. بقیهٔ قبض‌ها به صندوق نمی‌روند.');
    expect(fundHintText(['water', 'electricity', 'gas', 'building', 'cleaning', 'repairs', 'beautification', 'misc'])).toBe('با هر پرداخت روی همهٔ قبض‌ها، همان مبلغ به صندوق واریز می‌شود.');
    expect(fundHintText([])).toBe('هیچ قبضی انتخاب نشده؛ پرداخت قبض‌ها به صندوق نمی‌رود. فقط واریز و برداشت دستی در صندوق ثبت می‌شود.');
    // عمومی روی فهرست نوع‌ها (برای نوع‌های تعریف‌شدهٔ کاربر در آینده)
    expect(fundHintText(['x1'], ['x1', 'x2'], (t) => (t === 'x1' ? 'آسانسور' : 'نگهبانی'))).toContain('«آسانسور»');
  });

  it('کامپوننت: ردیف‌ها، شمارنده، تیک و راهنما', () => {
    const opts = [
      { id: 'building', label: 'شارژ ساختمان', color: '#8B5CF6', tag: 'پیش‌فرض' },
      { id: 'water', label: 'آب', color: '#14307A' },
    ];
    const html = renderToStaticMarkup(createElement(FundTypesPicker, { options: opts, selected: ['building'], onToggle: () => undefined }));
    for (const t of ['قبض‌های واریزی به صندوق', '۱ از ۲', 'شارژ ساختمان', 'آب', 'پیش‌فرض', FUND_HINT_FUTURE_ONLY, 'بقیهٔ قبض‌ها به صندوق نمی‌روند']) expect(html).toContain(t);
    expect(html.match(/year-row is-active/g)).toHaveLength(1);
    const none = renderToStaticMarkup(createElement(FundTypesPicker, { options: opts, selected: [], onToggle: () => undefined }));
    expect(none).toContain('fund-note is-empty');
    expect(none).toContain('پرداخت قبض‌ها به صندوق نمی‌رود');
  });

  it('CSS فقط با متغیرهای تم', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const rules = [...css.matchAll(/^\.(?:fund-types[^{]*|fund-note[^{]*|fund-card__intro)\{[^}]*\}/gm)].map((m) => m[0]);
    expect(rules.length).toBeGreaterThanOrEqual(12);
    for (const r of rules) expect(r).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('آموزش «صندوق ساختمان» انتخاب قبض‌ها را توضیح می‌دهد', () => {
    const t = HELP_TOPICS.find((x) => x.id === 'fund')!;
    const all = [t.intro, ...t.steps, ...(t.tips ?? []), ...(t.qa ?? []).flatMap((x) => [x.q, x.a])].join(' ');
    for (const s of ['قبض‌های واریزی به صندوق', 'فقط روی پرداخت‌های بعدی', 'انواع قبض و روش‌ها', 'شارژ ساختمان']) expect(all).toContain(s);
  });
});

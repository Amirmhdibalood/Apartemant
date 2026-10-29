/**
 * Stress / performance test for the real storage + domain layer (sql.js SQLite, billRepository, backup).
 * Not part of the fast suite (file suffix *.stress.ts). Run:
 *   npm run test:stress                         # default 5000 & 10000 bills × 100 units
 *   STRESS_BILLS=2000 STRESS_UNITS=20 npm run test:stress
 * Results → perf/results/stress-<bills>x<units>.json (+ console table).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits, ExpenseType, Unit } from '../../src/models/types';
import { EXPENSE_TYPE_ORDER } from '../../src/models/constants';
import { calculateBySplit } from '../../src/logic/split';
import { buildBill, emptyDraft } from '../../src/logic/billFactory';
import { yearlyReport } from '../../src/logic/report';
import { monthlyTotals, monthsWithBills } from '../../src/logic/monthlyTotals';
import { debtorsReport, paymentHistory } from '../../src/logic/debts';
import { chartSeries, typeShares } from '../../src/logic/chartReport';
import { filterBills, summarizeBills } from '../../src/logic/billFilter';
import { createBackup, parseBackup, serializeBackup } from '../../src/logic/backup';
import { resetIdbForTests } from '../../src/storage/idb';
import { closeSqliteKeepBytesForTests, getSqliteExportBytes, resetSqliteForTests } from '../../src/storage/sqlite/db';
import { billRepository } from '../../src/storage/billRepository';
import { backupRepository } from '../../src/storage/backupRepository';
import { buildingRepository } from '../../src/storage/buildingRepository';

const SIZES = (process.env.STRESS_BILLS ?? '5000,10000').split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
const UNITS = Number(process.env.STRESS_UNITS ?? 100);
const YEARS = [1400, 1401, 1402, 1403, 1404, 1405];

/** Deterministic PRNG so runs are reproducible */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function makeDataset(nBills: number, nUnits: number): { bills: Bill[]; units: Unit[] } {
  const r = rng(42 + nBills + nUnits);
  const bills: Bill[] = [];
  const units: Unit[] = [];
  const persons = Array.from({ length: nUnits }, (_, i) => 1 + (i % 5));
  const vacant = Array.from({ length: nUnits }, (_, i) => i % 17 === 0);
  for (let i = 0; i < nBills; i++) {
    const year = YEARS[i % YEARS.length];
    const month = 1 + (Math.floor(i / YEARS.length) % 12);
    const expenseType = EXPENSE_TYPE_ORDER[i % EXPENSE_TYPE_ORDER.length] as ExpenseType;
    const total = 1_000_000 + Math.floor(r() * 50_000_000);
    const method = i % 3 === 0 ? 'perUnit' : 'perPerson';
    const calc = calculateBySplit(total, persons.map((p, k) => (vacant[k] ? 0 : p)), method, vacant);
    const id = `b${i}`;
    const createdAt = new Date(Date.UTC(2021 + (year - 1400), month - 1, 1 + (i % 27), 8, 0, i % 60)).toISOString();
    let allSettled = true;
    calc.shares.forEach((s, k) => {
      const u: Unit = {
        id: `${id}-u${k + 1}`, billId: id, unitNumber: s.unitNumber, personCount: s.personCount,
        alias: k % 4 === 0 ? `واحد ${k + 1}` : null, ...(vacant[k] ? { vacant: true } : {}),
        shareAmount: s.shareAmount, isSettled: s.shareAmount === 0, payments: [],
      };
      if (s.shareAmount > 0) {
        const roll = r();
        if (roll < 0.6) u.payments = [{ id: `${u.id}-p1`, amount: s.shareAmount, paidAt: createdAt }];
        else if (roll < 0.7 && s.shareAmount > 1) u.payments = [{ id: `${u.id}-p1`, amount: Math.floor(s.shareAmount / 2), paidAt: createdAt }];
        u.isSettled = (u.payments ?? []).reduce((a, p) => a + p.amount, 0) === s.shareAmount;
      }
      if (!u.isSettled) allSettled = false;
      units.push(u);
    });
    bills.push({
      id, year, month, expenseType, billNumber: i % 2 ? String(100000 + i) : null, description: i % 5 === 0 ? 'توضیح تست' : null,
      totalAmount: total, createdAt, isFullySettled: allSettled, splitMethod: method,
      billPaid: i % 2 === 0, billPaidDate: null, dueDate: null, deletedAt: i % 194 === 1 ? createdAt : null,
    });
  }
  return { bills, units };
}

async function time<T>(fn: () => T | Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await fn();
  return [v, Math.round((performance.now() - t) * 10) / 10];
}
const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

describe.each(SIZES)('stress: %i bills × ' + UNITS + ' units', (nBills) => {
  it('seeds, loads, queries, reports, backs up', async () => {
    billRepository._resetCache();
    await resetIdbForTests();
    await resetSqliteForTests();
    const m: Record<string, number | string> = { bills: nBills, unitsPerBill: UNITS };

    const [{ bills, units }, tGen] = await time(() => makeDataset(nBills, UNITS));
    m.unitRows = units.length;
    m.paymentRows = units.reduce((s, u) => s + (u.payments?.length ?? 0), 0);
    m.genMs = tGen;

    // 1) seed via the real repository path used by backup restore (replaceAll → SQLite rows → persist)
    [, m.seedReplaceAllMs] = await time(() => billRepository.replaceAll(bills, units));
    await buildingRepository.replace({ units: Array.from({ length: UNITS }, (_, i) => ({ alias: null, defaultPersons: 1 + (i % 5) })) });

    // DB size + cost of one full export (done after every write today)
    const [bytes, tExport] = await time(() => getSqliteExportBytes()!);
    m.dbBytesMB = mb(bytes.length);
    // optional: dump the seeded SQLite file for the headless-browser harness (perf/browser-sqlite.mjs)
    if (process.env.STRESS_DB_OUT) {
      mkdirSync('perf/data', { recursive: true });
      writeFileSync(`perf/data/stress-${nBills}x${UNITS}.db`, bytes);
    }
    m.dbExportMs = tExport;

    // 2) cold start: close DB, drop cache, reopen from bytes and hydrate (what App does on launch)
    closeSqliteKeepBytesForTests();
    billRepository._resetCache();
    [, m.coldStartLoadMs] = await time(() => billRepository.warm());
    const [all, tGetAll] = await time(() => billRepository.getAll());
    m.getAllMs = tGetAll;
    expect(all.length).toBe(bills.filter((b) => !b.deletedAt).length);
    m.heapAfterLoadMB = mb(process.memoryUsage().heapUsed);

    // 3) Records (سوابق) with filters
    const [yearBills, tYear] = await time(() => billRepository.getByYear(1404, { includeDeleted: true }));
    m.recordsGetByYearMs = tYear;
    const [, tFilter] = await time(() => {
      let n = 0;
      for (const month of [null, 1, 6, 12]) for (const type of [null, 'water', 'building'] as const) for (const status of ['all', 'paid', 'unpaid', 'deleted'] as const) {
        const items = filterBills(yearBills, { year: 1404, month, type, status });
        summarizeBills(items); n += items.length;
      }
      return n;
    });
    m.recordsFilter48CombosMs = tFilter;

    // 4) Reports
    [, m.yearlyReportAllYearsMs] = await time(() => YEARS.forEach((y) => yearlyReport(all, y)));
    [, m.monthlyTotals12MonthsMs] = await time(() => monthsWithBills(all, 1404).forEach((mo) => monthlyTotals(all, 1404, mo)));
    [, m.chartsMs] = await time(() => { chartSeries(all, 1404, null, 1, 12); typeShares(all, 1404, 1, 12); });
    [, m.debtorsReportMs] = await time(() => debtorsReport(all));
    [, m.paymentHistory1UnitMs] = await time(() => paymentHistory(all, 7));
    [, m.paymentHistoryAllUnitsMs] = await time(() => { for (let u = 1; u <= UNITS; u++) paymentHistory(all, u); });

    // 5) New bill: split for 100 units + save into the large DB
    const draft = { ...emptyDraft(1405, 8), expenseType: 'water' as ExpenseType };
    const pc = Array.from({ length: UNITS }, (_, i) => 1 + (i % 5));
    const [calc, tSplit] = await time(() => calculateBySplit(123_456_789, pc, 'perPerson'));
    m.split100Ms = tSplit;
    const built: BillWithUnits = buildBill({ ...draft, personCounts: pc.map(String) }, calc, null);
    [, m.saveOneBillMs] = await time(() => billRepository.upsert(built.bill, built.units));
    [, m.markOnePaidMs] = await time(() => billRepository.upsert({ ...built.bill, billPaid: true }, built.units));

    // 6) Backup export → serialize → parse/validate → restore
    const [data, tCollect] = await time(() => backupRepository.collect());
    m.backupCollectMs = tCollect;
    const [text, tSer] = await time(() => serializeBackup(createBackup(data, 'stress')));
    m.backupSerializeMs = tSer;
    m.backupSizeMB = mb(Buffer.byteLength(text));
    const [parsed, tParse] = await time(() => parseBackup(text));
    m.backupParseValidateMs = tParse;
    m.backupParseOk = parsed.ok ? 'yes' : `NO: ${parsed.error}`;
    if (Buffer.byteLength(text) <= 64 * 1024 * 1024) expect(parsed.ok).toBe(true);
    // over the 64 MB import cap the file is rejected; still time a restore of the same data
    [, m.backupRestoreMs] = await time(() => backupRepository.replaceAll(parsed.ok ? parsed.backup.data : data));
    const after = await billRepository.getAllWithDeleted();
    expect(after.length).toBe(nBills + 1);
    m.heapEndMB = mb(process.memoryUsage().heapUsed);

    mkdirSync('perf/results', { recursive: true });
    writeFileSync(`perf/results/stress-${nBills}x${UNITS}.json`, JSON.stringify(m, null, 2));
    console.table(m);
  }, 30 * 60_000);
});

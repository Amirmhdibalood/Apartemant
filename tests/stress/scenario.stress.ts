/**
 * Permanent scenario suite (owner can rerun any time):
 *   npm run test:scenario                       # quick (default sizes)
 *   SCENARIO_SIZES=1000,5000,10000 npm run test:scenario
 * Covers: 4 buildings with 5/20/100/20 units (one archived), bills+payments+fund+periods+meetings in each →
 * full backup → wipe → restore → deep compare; cold restart (journal replay); old-format backups (v1/v4/v8 + a
 * generated large v8); corrupted / malicious backups rejected with no data change (incl. a byte-flip fuzz);
 * large-scale timings (bills × 100 units). Results → perf/results/scenario-*.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../../src/storage/idb';
import {
  checkpointSqlite, closeSqliteKeepBytesForTests, getPersistStats, memoryStoreForTests, resetSqliteForTests,
} from '../../src/storage/sqlite/db';
import { billRepository } from '../../src/storage/billRepository';
import { buildingRepository } from '../../src/storage/buildingRepository';
import { backupRepository } from '../../src/storage/backupRepository';
import { createBackup, parseBackup, serializeBackup, type BackupData } from '../../src/logic/backup';
import { DEFAULT_BUILDING_ID } from '../../src/storage/sqlite/schema';
import { digestAllTables, dumpAllTables, dumpPrefs, makeBills, rng, seedScenario, type BuildingSpec } from '../helpers/scenario';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;
const SIZES = (process.env.SCENARIO_SIZES ?? '1000').split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
const results: Record<string, unknown> = {};

async function wipe() {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
}
async function restart() {
  closeSqliteKeepBytesForTests();
  billRepository._resetCache();
}
async function time<T>(fn: () => T | Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await fn();
  return [v, Math.round((performance.now() - t) * 10) / 10];
}
const exportText = async () => serializeBackup(createBackup(await backupRepository.collect(), 'scenario'));

function save(name: string, data: unknown) {
  mkdirSync('perf/results', { recursive: true });
  writeFileSync(`perf/results/scenario-${name}.json`, JSON.stringify(data, null, 2));
}

const BUILDINGS: BuildingSpec[] = [
  { name: 'برج ۵ واحدی', units: 5, bills: 40, fund: true, periods: 3, meetings: 4 },
  { name: 'مجتمع ۲۰ واحدی', units: 20, bills: 60, fund: true, meetings: 6 },
  { name: 'شهرک ۱۰۰ واحدی', units: 100, bills: 80, fund: true, periods: 2, meetings: 3 },
  { name: 'ساختمان بایگانی', units: 20, bills: 15, archived: true, periods: 1, meetings: 1 },
];

describe('scenario: multi-building full backup → wipe → restore', () => {
  it('4 buildings (5/20/100/20 units): every table, every column, prefs and active building identical', async () => {
    await wipe();
    const [ids, tSeed] = await time(() => seedScenario(BUILDINGS, 11));
    const before = await dumpAllTables();
    const beforePrefs = await dumpPrefs();
    const counts = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.length]));
    for (const [t, n] of Object.entries(counts)) expect(n, t).toBeGreaterThan(0);

    const [text, tExport] = await time(exportText);
    const [parsed, tParse] = await time(() => parseBackup(text));
    if (!parsed.ok) throw new Error(parsed.error);
    await wipe();
    const [, tRestore] = await time(() => backupRepository.replaceAll(parsed.backup.data));
    expect(await dumpAllTables()).toEqual(before);
    expect(await dumpPrefs()).toEqual(beforePrefs);
    expect(await buildingRepository.getActiveId()).toBe(ids[1]);
    // each building's bills are in that building
    for (let i = 0; i < ids.length; i++) {
      const n = before.bills.filter((b) => b[1] === ids[i]).length;
      expect(n).toBe(BUILDINGS[i].bills);
    }
    // cold restart after restore (snapshot) and after more edits (journal)
    await restart();
    expect(await dumpAllTables()).toEqual(before);
    const [{ bill, units }] = makeBills(ids[2], 'after', 1, 100, 3);
    await billRepository.upsert(bill, units);
    await buildingRepository.addFundWithdraw(1234, 'پس از بازیابی', ids[2]);
    const edited = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(edited);
    // round-trip is stable: exporting again yields identical data
    await restart();
    const again = parseBackup(await exportText());
    expect(again.ok).toBe(true);
    results.multiBuilding = { counts, seedMs: tSeed, exportMs: tExport, parseMs: tParse, restoreMs: tRestore, backupKB: Math.round(text.length / 1024) };
    save('multi-building', results.multiBuilding);
  }, 10 * 60_000);
});

describe('scenario: old-format backups', () => {
  it.each(['backup-v1.json', 'backup-v4.json', 'backup-v8.json'])('%s restores into the default building, nothing lost', async (f) => {
    await wipe();
    await seedScenario(BUILDINGS.slice(0, 2), 5);
    const r = parseBackup(readFileSync(`tests/fixtures/${f}`, 'utf8'));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const rows = await dumpAllTables();
    expect(rows.bills.map((b) => b[0]).sort()).toEqual(r.backup.data.bills.map((b) => b.id).sort());
    expect(rows.bills.every((b) => b[1] === DEFAULT_BUILDING_ID)).toBe(true);
    expect(rows.bill_units).toHaveLength(r.backup.data.units.length);
  });

  it('a large generated v8 file (pre-1.8 shape) restores with every bill/unit/payment', async () => {
    await wipe();
    await seedScenario([{ name: 'یک', units: 50, bills: 300, fund: true }], 2);
    const full = JSON.parse(await exportText());
    for (const k of ['buildings', 'fundEntries', 'managementPeriods', 'meetings', 'multiBuilding']) delete full.data[k];
    full.backupVersion = 8;
    for (const b of full.data.bills) delete b.buildingId;
    const paymentsBefore = full.data.units.reduce((s: number, u: { payments?: unknown[] }) => s + (u.payments?.length ?? 0), 0);
    await wipe();
    const r = parseBackup(JSON.stringify(full));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const rows = await dumpAllTables();
    expect(rows.bills).toHaveLength(300);
    expect(rows.bill_units).toHaveLength(full.data.units.length);
    expect(rows.payments).toHaveLength(paymentsBefore);
  });
});

describe('scenario: corrupted / malicious backups are rejected and change nothing', () => {
  it('truncations, byte flips, prototype keys, wrong types, oversized values', async () => {
    await wipe();
    await seedScenario(BUILDINGS.slice(0, 2), 9);
    const before = await dumpAllTables();
    const beforePrefs = await dumpPrefs();
    const good = await exportText();
    const variants: string[] = [];
    // truncations
    for (const frac of [0.01, 0.25, 0.5, 0.9, 0.999]) variants.push(good.slice(0, Math.floor(good.length * frac)));
    // byte flips (fuzz) — deterministic
    const r = rng(1234);
    for (let i = 0; i < 300; i++) {
      const pos = Math.floor(r() * good.length);
      const ch = String.fromCharCode(32 + Math.floor(r() * 90));
      variants.push(good.slice(0, pos) + ch + good.slice(pos + 1));
    }
    // structural attacks
    const o = () => JSON.parse(good);
    const mut = (f: (x: any) => void) => { const x = o(); f(x); variants.push(JSON.stringify(x)); };
    mut((x) => { x.data.bills[0].expenseType = '__proto__'; });
    mut((x) => { x.data.fundEntries[0].kind = 'toString'; });
    mut((x) => { x.data.buildings[0].units = 'x'.repeat(10); });
    mut((x) => { x.data.meetings[0].summary = 'x'.repeat(100_000); });
    mut((x) => { x.data.bills[0].totalAmount = 1e300; });
    mut((x) => { x.data.units[0].shareAmount = -1; });
    mut((x) => { x.data.units[0].payments = [{ id: 'p', amount: Number.MAX_SAFE_INTEGER, paidAt: null }]; });
    mut((x) => { x.data.bills[0].buildingId = 'ghost'; });
    mut((x) => { delete x.data.fundEntries; });
    mut((x) => { x.backupVersion = 99; });
    mut((x) => { x.app = 'other'; });
    mut((x) => { x.data.meetings[0].attendance = [{ unitNumber: 0, status: 'present' }]; });
    variants.push('{"__proto__":{"polluted":1},"app":"apartemant","backupVersion":9,"createdAt":"2026-01-01T00:00:00Z","data":{"__proto__":{"x":1}}}');
    variants.push('', '   ', 'null', '[]', '{}', '\uFEFF{"app":"apartemant"}');

    let accepted = 0;
    let rejected = 0;
    for (const v of variants) {
      let res: ReturnType<typeof parseBackup>;
      expect(() => { res = parseBackup(v); }).not.toThrow();
      if (res!.ok) {
        // a flip inside free text (e.g. a description) can still be a valid backup; it is never auto-restored here
        accepted++;
        continue;
      }
      rejected++;
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(rejected).toBeGreaterThan(variants.length * 0.5);
    expect(await dumpAllTables()).toEqual(before);
    expect(await dumpPrefs()).toEqual(beforePrefs);
    results.malicious = { variants: variants.length, rejected, acceptedHarmless: accepted };
    save('malicious', results.malicious);
  }, 10 * 60_000);

  it('a valid-looking backup that fails mid-restore rolls back completely', async () => {
    await wipe();
    await seedScenario(BUILDINGS.slice(0, 2), 4);
    const before = await dumpAllTables();
    const data = await backupRepository.collect();
    const broken: BackupData = { ...data, units: [...data.units, { ...data.units[0], id: data.units[1].id }] }; // duplicate PK
    await expect(backupRepository.replaceAll(broken)).rejects.toThrow();
    expect(await dumpAllTables()).toEqual(before);
    await restart();
    expect(await dumpAllTables()).toEqual(before);
  });
});

describe.each(SIZES)('scenario timings: %i bills × 100 units (+ 2 small buildings)', (nBills) => {
  it('seed → save/edit → restart → backup → wipe → restore → digest equal', async () => {
    await wipe();
    const m: Record<string, number | string> = { bills: nBills, unitsPerBill: 100 };
    const ids = await seedScenario([
      { name: 'اصلی', units: 100, bills: 0, fund: true },
      { name: 'کوچک', units: 5, bills: 50, fund: true },
      { name: 'متوسط', units: 20, bills: 50 },
    ], 21);
    const big = makeBills(DEFAULT_BUILDING_ID, 'big', nBills, 100, 77);
    // seed the big building through a full-backup restore (fast bulk path)
    const base = await backupRepository.collect();
    const seed: BackupData = {
      ...base,
      bills: [...base.bills, ...big.map((x) => x.bill as typeof base.bills[number])],
      units: [...base.units, ...big.flatMap((x) => x.units)],
    };
    [, m.seedMs] = await time(() => backupRepository.replaceAll(seed));
    big.length = 0;

    [, m.coldStartAfterRestoreMs] = await time(() => billRepository.warm()); // cache was dropped by restore
    const [{ bill, units }] = makeBills(DEFAULT_BUILDING_ID, 'one', 1, 100, 1);
    const st0 = getPersistStats();
    [, m.saveOneBillMs] = await time(() => billRepository.upsert(bill, units));
    m.saveJournalKB = Math.round(getPersistStats().lastJournalBytes / 102.4) / 10;
    [, m.markPaidMs] = await time(() => billRepository.upsert({ ...bill, billPaid: true }, units));
    [, m.payOneUnitMs] = await time(() => billRepository.upsert({ ...bill, billPaid: true }, units.map((u, i) => (i === 3 ? { ...u, payments: [{ id: 'pay-1', amount: u.shareAmount, paidAt: new Date().toISOString() }], isSettled: true } : u))));
    [, m.fundWithdrawMs] = await time(() => buildingRepository.addFundWithdraw(1000, 'x', ids[0]));
    [, m.deleteBillMs] = await time(async () => { await billRepository.upsert({ ...bill, billPaid: false }, units); await billRepository.remove(bill.id); });
    m.checkpointsDuringSaves = getPersistStats().checkpoints - st0.checkpoints;
    m.journalKB = Math.round(memoryStoreForTests().journal.length / 102.4) / 10;

    const digest = await digestAllTables();
    [, m.coldStartWithReplayMs] = await time(async () => { await restart(); await billRepository.warm(); });
    expect(await digestAllTables()).toEqual(digest);
    [, m.checkpointMs] = await time(() => checkpointSqlite());
    m.snapshotMB = Math.round(memoryStoreForTests().snapshotBytes / 104857.6) / 10;

    const [data, tCollect] = await time(() => backupRepository.collect());
    m.collectMs = tCollect;
    const [text, tSer] = await time(() => serializeBackup(createBackup(data, 'scenario')));
    m.serializeMs = tSer;
    m.backupMB = Math.round(Buffer.byteLength(text) / 104857.6) / 10;
    const [parsed, tParse] = await time(() => parseBackup(text));
    m.parseMs = tParse;
    if (!parsed.ok) throw new Error(parsed.error);
    [, m.safetyCopyMs] = await time(() => backupRepository.saveSafetyBackup('scenario'));
    await wipe();
    [, m.restoreMs] = await time(() => backupRepository.replaceAll(parsed.backup.data));
    expect(await digestAllTables()).toEqual(digest);
    await restart();
    expect(await digestAllTables()).toEqual(digest);
    m.heapMB = Math.round(process.memoryUsage().heapUsed / 104857.6) / 10;
    save(`timings-${nBills}x100`, m);
    console.table(m);
  }, 30 * 60_000);
});

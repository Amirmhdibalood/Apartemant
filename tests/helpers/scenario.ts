/**
 * Shared multi-building scenario seeding + deep data dumps for backup/restore tests
 * (used by tests/fullBackup.test.ts and tests/stress/scenario.stress.ts).
 * Everything goes through the real repositories (billRepository, buildingRepository, backupRepository).
 */
import type { Bill, BuildingUnit, ExpenseType, Unit } from '../../src/models/types';
import { EXPENSE_TYPE_ORDER } from '../../src/models/constants';
import { calculateBySplit } from '../../src/logic/split';
import { billRepository } from '../../src/storage/billRepository';
import { buildingRepository } from '../../src/storage/buildingRepository';
import { settingsRepository } from '../../src/storage/settingsRepository';
import { splitDefaultsRepository } from '../../src/storage/splitDefaultsRepository';
import { activeBuildingStore } from '../../src/storage/activeBuildingStore';
import { withSqlite } from '../../src/storage/sqlite/db';
import { listSqliteTables } from '../../src/storage/sqlite/fullBackup';
import { DEFAULT_BUILDING_ID } from '../../src/storage/sqlite/schema';

export interface BuildingSpec {
  name: string;
  units: number;
  bills: number;
  fund?: boolean;
  /** قبض‌های واریزی به صندوق (پیش‌فرض: فقط شارژ) */
  fundTypes?: ExpenseType[];
  archived?: boolean;
  periods?: number;
  meetings?: number;
}

/** Deterministic PRNG */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const YEARS = [1403, 1404, 1405];

export function makeBills(buildingId: string, prefix: string, nBills: number, nUnits: number, seed: number): { bill: Bill; units: Unit[] }[] {
  const r = rng(seed);
  const out: { bill: Bill; units: Unit[] }[] = [];
  const persons = Array.from({ length: nUnits }, (_, i) => 1 + (i % 4));
  const vacant = Array.from({ length: nUnits }, (_, i) => nUnits > 3 && i % 7 === 3);
  for (let i = 0; i < nBills; i++) {
    const year = YEARS[i % YEARS.length];
    const month = 1 + (Math.floor(i / YEARS.length) % 12);
    const expenseType = EXPENSE_TYPE_ORDER[i % EXPENSE_TYPE_ORDER.length] as ExpenseType;
    const total = 100_000 + Math.floor(r() * 9_000_000);
    const method = i % 3 === 0 ? 'perUnit' : 'perPerson';
    const calc = calculateBySplit(total, persons.map((p, k) => (vacant[k] ? 0 : p)), method, vacant);
    const id = `${prefix}-b${i}`;
    const createdAt = new Date(Date.UTC(2024 + (year - 1403), month - 1, 1 + (i % 27), 8, i % 60, 0)).toISOString();
    let all = true;
    const units: Unit[] = calc.shares.map((s, k) => {
      const u: Unit = {
        id: `${id}-u${k + 1}`, billId: id, unitNumber: s.unitNumber, personCount: s.personCount,
        alias: k % 3 === 0 ? `واحد ${k + 1}` : null, ...(vacant[k] ? { vacant: true } : {}),
        shareAmount: s.shareAmount, isSettled: s.shareAmount === 0, payments: [],
      };
      if (s.shareAmount > 0) {
        const roll = r();
        if (roll < 0.5) u.payments = [{ id: `${u.id}-p1`, amount: s.shareAmount, paidAt: createdAt }];
        else if (roll < 0.7 && s.shareAmount > 1) {
          const half = Math.floor(s.shareAmount / 2);
          u.payments = [
            { id: `${u.id}-p1`, amount: half, paidAt: createdAt, batchId: `${id}-batch` },
            ...(roll < 0.6 ? [{ id: `${u.id}-p2`, amount: s.shareAmount - half, paidAt: createdAt }] : []),
          ];
        }
        u.isSettled = (u.payments ?? []).reduce((a, p) => a + p.amount, 0) === s.shareAmount;
      }
      if (!u.isSettled) all = false;
      return u;
    });
    out.push({
      bill: {
        id, buildingId, year, month, expenseType, billNumber: i % 2 ? String(5000 + i) : null,
        description: i % 4 === 0 ? `توضیح ${prefix} ${i}` : null, totalAmount: total, createdAt, isFullySettled: all,
        splitMethod: method, billPaid: i % 2 === 0, billPaidDate: i % 2 === 0 ? '1405-01-10' : null,
        dueDate: i % 5 === 0 ? '1405-02-01' : null, deletedAt: i % 9 === 4 ? createdAt : null,
      },
      units,
    });
  }
  return out;
}

function templates(n: number, tag: string): BuildingUnit[] {
  return Array.from({ length: n }, (_, i) => ({
    alias: i % 2 === 0 ? `${tag} ${i + 1}` : null,
    defaultPersons: 1 + (i % 4),
    ...(n > 3 && i % 7 === 3 ? { vacant: true } : {}),
    ...(i % 3 === 0 ? { area: 50 + i + 0.25 } : {}),
    ...(i % 2 === 1 ? { phone: `0912${String(1000000 + i).slice(-7)}` } : {}),
  }));
}

/** Seed several buildings, each with bills/payments, fund ledger, periods, meetings. Returns building ids. */
export async function seedScenario(specs: BuildingSpec[], seed = 7): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const id = i === 0 ? DEFAULT_BUILDING_ID : await buildingRepository.create(sp.name, false);
    if (i === 0) await buildingRepository.rename(id, sp.name);
    ids.push(id);
    await buildingRepository.save({ units: templates(sp.units, sp.name) }, id);
    if (sp.fund) await buildingRepository.setFundEnabled(true, id);
    if (sp.fundTypes) await buildingRepository.setFundTypes(sp.fundTypes, id);
    // building-charge bills (fund sync) need expenseType 'building' — makeBills cycles all types
    const items = makeBills(id, `s${i}`, sp.bills, sp.units, seed * 31 + i);
    if (items.length) await billRepository.upsertMany(items);
    if (sp.fund) {
      await buildingRepository.addFundDepositManual(5_000_000 + i, `واریز دستی ${sp.name}`, id);
      await buildingRepository.addFundWithdraw(1_000_000 + i, 'خرید لامپ', id);
    }
    const nPeriods = sp.periods ?? 2;
    for (let p = 0; p < nPeriods; p++) {
      await buildingRepository.addManagementPeriod({
        managerLabel: `مدیر ${p + 1} ${sp.name}`, startDate: `${1403 + p}-01-01`, endDate: `${1403 + p}-12-29`,
        notes: p % 2 ? 'یادداشت دوره' : null, endPreviousEarly: p > 0,
      }, id);
    }
    const nMeetings = sp.meetings ?? 2;
    for (let m = 0; m < nMeetings; m++) {
      await buildingRepository.addMeeting({
        meetingDate: `1405-0${1 + (m % 9)}-1${m % 10}`, weekday: 'شنبه', hour: 18 + (m % 5), minute: (m * 7) % 60,
        place: m % 2 ? 'لابی' : null, summary: `خلاصهٔ جلسه ${m + 1} — ${sp.name}`,
        attendance: Array.from({ length: Math.min(sp.units, 30) }, (_, k) => ({
          unitNumber: k + 1, unitAlias: k % 2 ? null : `واحد ${k + 1}`, status: (['present', 'absent', 'empty'] as const)[(k + m) % 3],
        })),
      }, id);
    }
  }
  for (let i = 0; i < specs.length; i++) if (specs[i].archived && i > 0) await buildingRepository.archive(ids[i]);
  await settingsRepository.save({ showSaveWarning: false, activeYears: [1405, 1406], dismissedWarnings: ['duplicateBill'] });
  await splitDefaultsRepository.replace({ gas: 'perUnit', water: 'perPerson' });
  if (specs.length > 1) {
    await activeBuildingStore.setMultiEnabled(true);
    await activeBuildingStore.setActiveId(ids[1]);
  }
  await billRepository.flush();
  return ids;
}

/** Columns that are regenerated on restore (random ids of child rows that have no identity of their own). */
const REGENERATED: Record<string, string[]> = {
  building_unit_templates: ['id'],
  meeting_attendance: ['id'],
};

/**
 * Raw dump of every user table (all columns, sorted) — catches any table/column a backup forgets.
 * app_meta is engine bookkeeping and excluded.
 */
export async function dumpAllTables(): Promise<Record<string, unknown[][]>> {
  return withSqlite((db) => {
    const out: Record<string, unknown[][]> = {};
    for (const t of listSqliteTables(db)) {
      if (t === 'app_meta') continue;
      const res = db.exec(`SELECT * FROM ${t}`);
      if (!res.length) { out[t] = []; continue; }
      const cols = res[0].columns;
      const drop = new Set((REGENERATED[t] ?? []).map((c) => cols.indexOf(c)));
      const rowsOut = res[0].values.map((r) => r.filter((_, i) => !drop.has(i)));
      rowsOut.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      out[t] = rowsOut;
    }
    return out;
  });
}

export async function dumpPrefs() {
  return {
    settings: await settingsRepository.get(),
    splitDefaults: await splitDefaultsRepository.get(),
    multi: await activeBuildingStore.isMultiEnabled(),
    active: await activeBuildingStore.getActiveId(),
  };
}

/**
 * Order-independent digest of every user table (row count + sum of 32-bit FNV-1a row hashes per table).
 * Streams rows — used instead of dumpAllTables() at 10k bills × 100 units where a full sorted dump would be GBs.
 */
export async function digestAllTables(): Promise<Record<string, string>> {
  return withSqlite((db) => {
    const out: Record<string, string> = {};
    for (const t of listSqliteTables(db)) {
      if (t === 'app_meta') continue;
      const stmt = db.prepare(`SELECT * FROM ${t}`);
      let cols: string[] | null = null;
      let drop = new Set<number>();
      let n = 0;
      let sumA = 0;
      let sumB = 0;
      while (stmt.step()) {
        if (!cols) {
          cols = stmt.getColumnNames();
          drop = new Set((REGENERATED[t] ?? []).map((c) => cols!.indexOf(c)));
        }
        const vals = stmt.get();
        let h1 = 0x811c9dc5;
        let h2 = 0x01000193;
        for (let i = 0; i < vals.length; i++) {
          if (drop.has(i)) continue;
          const s = vals[i] === null ? '\u0000' : `${typeof vals[i]}:${String(vals[i])}`;
          for (let k = 0; k < s.length; k++) {
            const c = s.charCodeAt(k);
            h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
            h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
          }
          h1 = Math.imul(h1 ^ 0xff, 0x01000193) >>> 0;
        }
        sumA = (sumA + h1) % 4294967296;
        sumB = (sumB + h2) % 4294967296;
        n++;
      }
      stmt.free();
      out[t] = `${n}:${sumA.toString(16)}:${sumB.toString(16)}`;
    }
    return out;
  });
}

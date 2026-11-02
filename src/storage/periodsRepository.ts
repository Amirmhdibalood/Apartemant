/**
 * «دوره‌ها»: سال‌ها و مدیر ساختمانِ هر ساختمان (SQLite، شِمای ۸) + قفل قبض‌ها.
 */
import type { BuildingYear, LockContext, MgmtPeriod } from '../logic/periods';
import {
  billLockState, closedYearSet, defaultBillYear, isPeriodClosed, mergeBuildingYears, planNewPeriod, validatePeriodEdit,
  type BillLock,
} from '../logic/periods';
import { jalaliIsoDate } from '../logic/date';
import { todayJalali } from '../logic/jalali';
import { withSqlite, withSqliteWrite, getMeta, setMeta } from './sqlite/db';
import {
  endManagementPeriodEarly, getManagementPeriod, inTransaction, insertManagementPeriod, listBuildings, updateManagementPeriod,
} from './sqlite/domain';
import {
  billCountForYear, billYearCounts, deleteYearRow, getDefaultYear, getMgmtEnabled, lockedBillIds, readPeriods, readYearRows,
  setDefaultYear, setMgmtEnabled, upsertYearRow, YEARS_SEEDED_META,
} from './sqlite/periodsSql';
import { ensureMigrationDone } from './migration';
import { activeBuildingStore } from './activeBuildingStore';
import { settingsRepository } from './settingsRepository';
import { readJson, writeJson } from './kvStore';

const SHOW_HIDDEN_KEY = 'periodsShowHidden';

export interface YearInfo extends BuildingYear {
  /** تعداد قبض‌های حذف‌نشده */
  billCount: number;
  /** هر قبضی (حذف‌شده هم) دارد → «برداشتن از فهرست» ممکن نیست */
  hasAnyBill: boolean;
}

export interface PeriodsState {
  buildingId: string;
  years: YearInfo[];
  defaultYear: number | null;
  mgmtEnabled: boolean;
  periods: MgmtPeriod[];
  /** periodId → تعداد قبض‌ها */
  periodBillCounts: Map<string, number>;
}

export interface ShowHiddenPrefs { years: boolean; managers: boolean }

type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

export const todayKeyNow = (): string => jalaliIsoDate(new Date());

async function activeId(buildingId?: string): Promise<string> {
  await ensureMigrationDone();
  return buildingId ?? activeBuildingStore.getActiveId();
}

/** یک‌بار برای هر ساختمان: سال‌های فعالِ تنظیمات قدیمی به فهرست سال‌های ساختمان می‌آیند */
async function ensureSeeded(buildingId: string): Promise<void> {
  const seeded = await withSqlite((db) => {
    try { return JSON.parse(getMeta(db, YEARS_SEEDED_META) ?? '[]') as string[]; } catch { return []; }
  });
  if (seeded.includes(buildingId)) return;
  const settings = await settingsRepository.get();
  const current = todayJalali().year;
  await withSqliteWrite((db) => inTransaction(db, () => {
    const rows = readYearRows(db, buildingId);
    if (rows.length === 0) {
      const years = new Set<number>(settings.activeYears);
      if (years.size === 0) years.add(current);
      for (const year of years) upsertYearRow(db, buildingId, { year, closedAt: null, hidden: false });
    }
    let list: string[] = [];
    try { list = JSON.parse(getMeta(db, YEARS_SEEDED_META) ?? '[]') as string[]; } catch { /* ignore */ }
    if (!list.includes(buildingId)) list.push(buildingId);
    setMeta(db, YEARS_SEEDED_META, JSON.stringify(list));
  }));
}

function readState(db: Parameters<typeof readPeriods>[0], buildingId: string): PeriodsState {
  const counts = billYearCounts(db, buildingId);
  const merged = mergeBuildingYears(readYearRows(db, buildingId), counts.keys());
  const years: YearInfo[] = merged.map((y) => ({
    ...y,
    billCount: counts.get(y.year) ?? 0,
    hasAnyBill: billCountForYear(db, buildingId, y.year) > 0,
  }));
  const periodBillCounts = new Map<string, number>();
  const r = db.exec('SELECT mgmt_period_id, count(*) FROM bills WHERE building_id = ? AND deleted_at IS NULL AND mgmt_period_id IS NOT NULL GROUP BY mgmt_period_id', [buildingId]);
  for (const row of r[0]?.values ?? []) periodBillCounts.set(String(row[0]), Number(row[1]));
  return {
    buildingId,
    years,
    defaultYear: getDefaultYear(db, buildingId),
    mgmtEnabled: getMgmtEnabled(db, buildingId),
    periods: readPeriods(db, buildingId),
    periodBillCounts,
  };
}

async function write<T>(buildingId: string | undefined, fn: (db: Parameters<typeof readPeriods>[0], bid: string) => T): Promise<T> {
  const bid = await activeId(buildingId);
  await ensureSeeded(bid);
  const out = await withSqliteWrite((db) => inTransaction(db, () => fn(db, bid)));
  notify();
  return out;
}

export class PeriodRuleError extends Error {}

export const periodsRepository = {
  async getState(buildingId?: string): Promise<PeriodsState> {
    const bid = await activeId(buildingId);
    await ensureSeeded(bid);
    return withSqlite((db) => readState(db, bid));
  },

  /** سال‌های ساختمان (ادغام با سال‌های دارای قبض) */
  async listYears(buildingId?: string): Promise<YearInfo[]> {
    return (await this.getState(buildingId)).years;
  },

  /** سال پیش‌فرض فرم قبض تازه (null = هیچ سال بازی نیست) */
  async defaultYearForNewBill(buildingId?: string): Promise<number | null> {
    const s = await this.getState(buildingId);
    return defaultBillYear(s.years, s.defaultYear, todayJalali().year);
  },

  async addYear(year: number, buildingId?: string): Promise<void> {
    if (!Number.isInteger(year) || year < 1300 || year > 1700) throw new PeriodRuleError('سال نامعتبر است.');
    await write(buildingId, (db, bid) => {
      if (readYearRows(db, bid).some((y) => y.year === year)) return;
      upsertYearRow(db, bid, { year, closedAt: null, hidden: false });
    });
  },

  /** «برداشتن از فهرست»: فقط سالی که هیچ قبضی ندارد */
  async removeYear(year: number, buildingId?: string): Promise<void> {
    await write(buildingId, (db, bid) => {
      if (billCountForYear(db, bid, year) > 0) throw new PeriodRuleError('این سال قبض دارد و از فهرست برداشته نمی‌شود؛ می‌توانید آن را ببندید.');
      deleteYearRow(db, bid, year);
      if (getDefaultYear(db, bid) === year) setDefaultYear(db, bid, null);
    });
  },

  /** «بستن سال»: برگشت ندارد */
  async closeYear(year: number, buildingId?: string, now: Date = new Date()): Promise<void> {
    await write(buildingId, (db, bid) => {
      const cur = readYearRows(db, bid).find((y) => y.year === year);
      if (cur?.closedAt) return;
      upsertYearRow(db, bid, { year, closedAt: now.toISOString(), hidden: false });
      if (getDefaultYear(db, bid) === year) setDefaultYear(db, bid, null);
    });
  },

  async setYearHidden(year: number, hidden: boolean, buildingId?: string): Promise<void> {
    await write(buildingId, (db, bid) => {
      const cur = readYearRows(db, bid).find((y) => y.year === year);
      if (!cur?.closedAt) throw new PeriodRuleError('فقط سال بسته پنهان می‌شود.');
      upsertYearRow(db, bid, { ...cur, hidden });
    });
  },

  async setDefaultYear(year: number, buildingId?: string): Promise<void> {
    await write(buildingId, (db, bid) => {
      const cur = readYearRows(db, bid).find((y) => y.year === year);
      if (cur?.closedAt) throw new PeriodRuleError('سال بسته نمی‌تواند پیش‌فرض باشد.');
      if (!cur) upsertYearRow(db, bid, { year, closedAt: null, hidden: false });
      setDefaultYear(db, bid, year);
    });
  },

  async setMgmtEnabled(on: boolean, buildingId?: string): Promise<void> {
    await write(buildingId, (db, bid) => setMgmtEnabled(db, bid, on));
  },

  /** پیش‌نمایش ثبت مدیر جدید: کدام دوره‌ها بسته می‌شوند (برای پیام تأیید) */
  async planNewManager(input: { managerUnit: number | null; startDate: string; endDate: string | null }, buildingId?: string) {
    const s = await this.getState(buildingId);
    return planNewPeriod(s.periods, input, todayKeyNow());
  },

  /** ثبت مدیر جدید؛ دورهٔ باز قبلی روز قبل از شروع جدید بسته می‌شود (تأیید قبلاً گرفته شده) */
  async addManager(input: { managerUnit: number | null; alias: string; startDate: string; endDate: string | null; notes?: string | null }, buildingId?: string): Promise<string> {
    return write(buildingId, (db, bid) => {
      const plan = planNewPeriod(readPeriods(db, bid), input, todayKeyNow());
      if (!plan.ok) throw new PeriodRuleError(plan.error);
      for (const c of plan.closes) updateManagementPeriod(db, c.id, { endDate: c.endDate });
      return insertManagementPeriod(db, {
        buildingId: bid,
        managerLabel: input.alias,
        managerUnit: input.managerUnit,
        startDate: input.startDate,
        endDate: input.endDate ?? '',
        notes: input.notes ?? null,
      });
    });
  },

  async editManager(id: string, input: { managerUnit: number | null; alias: string; endDate: string | null }): Promise<void> {
    await ensureMigrationDone();
    const p = await withSqlite((db) => getManagementPeriod(db, id));
    if (!p) return;
    await write(p.buildingId, (db, bid) => {
      const err = validatePeriodEdit(readPeriods(db, bid), p, input, todayKeyNow());
      if (err) throw new PeriodRuleError(err);
      updateManagementPeriod(db, id, { managerUnit: input.managerUnit, managerLabel: input.alias, endDate: input.endDate ?? '' });
    });
  },

  /** «بستن دوره»: برگشت ندارد */
  async closeManager(id: string, now: Date = new Date()): Promise<void> {
    await ensureMigrationDone();
    const p = await withSqlite((db) => getManagementPeriod(db, id));
    if (!p) return;
    await write(p.buildingId, (db) => endManagementPeriodEarly(db, id, now.toISOString(), jalaliIsoDate(now)));
  },

  async setManagerHidden(id: string, hidden: boolean): Promise<void> {
    await ensureMigrationDone();
    const p = await withSqlite((db) => getManagementPeriod(db, id));
    if (!p) return;
    if (!isPeriodClosed(p, todayKeyNow())) throw new PeriodRuleError('فقط دورهٔ بسته پنهان می‌شود.');
    await write(p.buildingId, (db) => updateManagementPeriod(db, id, { hidden }));
  },

  /** زمینهٔ قفل قبض‌های یک ساختمان */
  async lockContext(buildingId?: string): Promise<LockContext> {
    const s = await this.getState(buildingId);
    return { closedYears: closedYearSet(s.years), periods: s.periods, todayKey: todayKeyNow() };
  },

  /** وضعیت قفل یک قبض (از روی SQLite: سال بسته یا دورهٔ بسته) */
  async billLock(billId: string): Promise<BillLock> {
    await ensureMigrationDone();
    const row = await withSqlite((db) => {
      const r = db.exec('SELECT building_id, year, mgmt_period_id FROM bills WHERE id = ?', [billId]);
      const v = r[0]?.values[0];
      return v ? { buildingId: String(v[0]), year: Number(v[1]), mgmtPeriodId: v[2] == null ? null : String(v[2]) } : null;
    });
    if (!row) return { locked: false, reason: null, period: null };
    const ctx = await this.lockContext(row.buildingId);
    return billLockState(row, ctx);
  },

  /** id قبض‌های قفل ساختمان فعال */
  async lockedIds(buildingId?: string): Promise<Set<string>> {
    const bid = await activeId(buildingId);
    await ensureSeeded(bid);
    const today = todayKeyNow();
    return withSqlite((db) => lockedBillIds(db, bid, today, (p) => isPeriodClosed(p, today)));
  },

  async getShowHidden(): Promise<ShowHiddenPrefs> {
    const v = await readJson<Partial<ShowHiddenPrefs> | null>(SHOW_HIDDEN_KEY, null);
    return { years: v?.years === true, managers: v?.managers === true };
  },

  async setShowHidden(patch: Partial<ShowHiddenPrefs>): Promise<void> {
    const cur = await this.getShowHidden();
    await writeJson(SHOW_HIDDEN_KEY, { ...cur, ...patch });
    notify();
  },

  /** سال‌هایی که فیلترها و گزارش‌ها نشان می‌دهند (پنهان‌ها فقط با «نمایش سال‌های پنهان») */
  async filterYears(buildingId?: string): Promise<number[]> {
    const [s, show] = await Promise.all([this.getState(buildingId), this.getShowHidden()]);
    return s.years.filter((y) => show.years || !y.hidden).map((y) => y.year).sort((a, b) => a - b);
  },

  async buildingIds(): Promise<string[]> {
    await ensureMigrationDone();
    return withSqlite((db) => listBuildings(db, { includeArchived: true }).map((b) => b.id));
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

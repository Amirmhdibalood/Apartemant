/**
 * «دوره‌ها»: سال‌ها و مدیریت ساختمانِ هر ساختمان (SQLite، شِمای ۸) + قفل قبض‌ها.
 * از ۱.۹.۱ سال‌ها خودکارند (سال جاری همیشه هست، فقط سال بعد اضافه می‌شود، فقط پنهان/نمایش)
 * و قفل قبض فقط از دورهٔ مدیریتِ بسته می‌آید.
 */
import type { BuildingYear, LockContext, MgmtPeriod } from '../logic/periods';
import {
  billLockState, canHideYear, defaultBillYear, isPeriodClosed, mergeBuildingYears, planNewPeriod, staleYearRows, validatePeriodEdit,
  visibleYears, type BillLock,
} from '../logic/periods';
import { jalaliIsoDate } from '../logic/date';
import { todayJalali } from '../logic/jalali';
import { withSqlite, withSqliteWrite } from './sqlite/db';
import {
  endManagementPeriodEarly, getManagementPeriod, inTransaction, insertManagementPeriod, listBuildings, updateManagementPeriod,
} from './sqlite/domain';
import {
  anyBillYears, billYearCounts, clearClosedYears, deleteYearRow, getMgmtEnabled, hasClosedYearRows, lockedBillIds, readPeriods,
  readYearRows, setMgmtEnabled, upsertYearRow,
} from './sqlite/periodsSql';
import { ensureMigrationDone } from './migration';
import { activeBuildingStore } from './activeBuildingStore';
import { readJson, writeJson } from './kvStore';

const SHOW_HIDDEN_KEY = 'periodsShowHidden';

export interface YearInfo extends BuildingYear {
  /** تعداد قبض‌های حذف‌نشده */
  billCount: number;
  /** سال جاری */
  isCurrent: boolean;
  /** پنهان‌شدنی است؟ (سال جاری و سال بعد نه) */
  canHide: boolean;
}

export interface PeriodsState {
  buildingId: string;
  /** سال جاری (برای فهرست و فرم قبض) */
  currentYear: number;
  /** همهٔ سال‌های فهرست (پنهان‌ها هم)، نزولی */
  years: YearInfo[];
  mgmtEnabled: boolean;
  periods: MgmtPeriod[];
  /** periodId → تعداد قبض‌ها */
  periodBillCounts: Map<string, number>;
}

/** فقط دوره‌های مدیریت؛ سال‌های پنهان از ۱.۹.۱ در بخش جمع‌شدهٔ «سال‌های پنهان» دیده می‌شوند */
export interface ShowHiddenPrefs { managers: boolean }

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

/**
 * سال‌های ساختمان را مرتب نگه می‌دارد (فقط اگر لازم باشد می‌نویسد):
 * سال جاری ساخته می‌شود (مثلاً اول فروردین)، زمان بستنِ ۱.۹.۰ پاک می‌شود و سال‌های خالیِ
 * قدیمی (قبل از سال جاری، بدون هیچ قبضی) یا سال آیندهٔ خالی از فهرست برداشته می‌شوند.
 */
async function ensureYears(buildingId: string, currentYear: number = todayJalali().year): Promise<void> {
  const plan = await withSqlite((db) => {
    const rows = readYearRows(db, buildingId);
    const stale = staleYearRows(rows, anyBillYears(db, buildingId), currentYear);
    const needCurrent = !rows.some((r) => r.year === currentYear);
    const unhide = rows.filter((r) => r.hidden && !canHideYear(r.year, currentYear)).map((r) => r.year);
    const closed = hasClosedYearRows(db, buildingId);
    return { stale, needCurrent, unhide, closed };
  });
  if (!plan.needCurrent && plan.stale.length === 0 && plan.unhide.length === 0 && !plan.closed) return;
  await withSqliteWrite((db) => inTransaction(db, () => {
    if (plan.closed) clearClosedYears(db, buildingId);
    for (const y of plan.stale) deleteYearRow(db, buildingId, y);
    for (const y of plan.unhide) upsertYearRow(db, buildingId, { year: y, closedAt: null, hidden: false });
    if (plan.needCurrent) upsertYearRow(db, buildingId, { year: currentYear, closedAt: null, hidden: false });
  }));
}

function readState(db: Parameters<typeof readPeriods>[0], buildingId: string): PeriodsState {
  const currentYear = todayJalali().year;
  const counts = billYearCounts(db, buildingId);
  const merged = mergeBuildingYears(readYearRows(db, buildingId), anyBillYears(db, buildingId), currentYear);
  const years: YearInfo[] = merged.map((y) => ({
    ...y,
    billCount: counts.get(y.year) ?? 0,
    isCurrent: y.year === currentYear,
    canHide: canHideYear(y.year, currentYear),
  }));
  const periodBillCounts = new Map<string, number>();
  const r = db.exec('SELECT mgmt_period_id, count(*) FROM bills WHERE building_id = ? AND deleted_at IS NULL AND mgmt_period_id IS NOT NULL GROUP BY mgmt_period_id', [buildingId]);
  for (const row of r[0]?.values ?? []) periodBillCounts.set(String(row[0]), Number(row[1]));
  return {
    buildingId,
    currentYear,
    years,
    mgmtEnabled: getMgmtEnabled(db, buildingId),
    periods: readPeriods(db, buildingId),
    periodBillCounts,
  };
}

async function write<T>(buildingId: string | undefined, fn: (db: Parameters<typeof readPeriods>[0], bid: string) => T): Promise<T> {
  const bid = await activeId(buildingId);
  await ensureYears(bid);
  const out = await withSqliteWrite((db) => inTransaction(db, () => fn(db, bid)));
  notify();
  return out;
}

export class PeriodRuleError extends Error {}

export const periodsRepository = {
  async getState(buildingId?: string): Promise<PeriodsState> {
    const bid = await activeId(buildingId);
    await ensureYears(bid);
    return withSqlite((db) => readState(db, bid));
  },

  /** سال‌های ساختمان (ادغام با سال‌های دارای قبض) */
  async listYears(buildingId?: string): Promise<YearInfo[]> {
    return (await this.getState(buildingId)).years;
  },

  /** سال قبض تازه: سال جاری */
  async defaultYearForNewBill(buildingId?: string): Promise<number> {
    const s = await this.getState(buildingId);
    return defaultBillYear(s.currentYear);
  },

  /** @deprecated از ۱.۹.۲ افزودن سال بعد حذف شد — no-op، سال جاری را برمی‌گرداند */
  async addNextYear(buildingId?: string): Promise<number> {
    const s = await this.getState(buildingId);
    return s.currentYear;
  },

  /** پنهان / نمایش سال (سال جاری پنهان نمی‌شود) */
  async setYearHidden(year: number, hidden: boolean, buildingId?: string): Promise<void> {
    const current = todayJalali().year;
    if (hidden && !canHideYear(year, current)) throw new PeriodRuleError('سال جاری همیشه نمایان است و پنهان نمی‌شود.');
    await write(buildingId, (db, bid) => {
      upsertYearRow(db, bid, { year, closedAt: null, hidden });
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
    return { periods: s.periods, todayKey: todayKeyNow() };
  },

  /** وضعیت قفل یک قبض (از روی SQLite: دورهٔ مدیریتِ بسته) */
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
    await ensureYears(bid);
    const today = todayKeyNow();
    return withSqlite((db) => lockedBillIds(db, bid, today, (p) => isPeriodClosed(p, today)));
  },

  async getShowHidden(): Promise<ShowHiddenPrefs> {
    const v = await readJson<Partial<ShowHiddenPrefs> | null>(SHOW_HIDDEN_KEY, null);
    return { managers: v?.managers === true };
  },

  async setShowHidden(patch: Partial<ShowHiddenPrefs>): Promise<void> {
    const cur = await this.getShowHidden();
    await writeJson(SHOW_HIDDEN_KEY, { ...cur, ...patch });
    notify();
  },

  /** سال‌هایی که فیلترها و گزارش‌ها نشان می‌دهند (سال پنهان نه) — صعودی */
  async filterYears(buildingId?: string): Promise<number[]> {
    return visibleYears((await this.getState(buildingId)).years);
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

/**
 * SQL سال‌ها و دوره‌های مدیریت هر ساختمان (شِمای ۸). فقط به sql.js وابسته است تا db.ts هم بتواند
 * مهاجرت داده را صدا بزند (بدون حلقهٔ import).
 */
import type { Database } from 'sql.js';
import type { BuildingYear, MgmtPeriod } from '../../logic/periods';
import { periodForCreatedAt } from '../../logic/periods';

function all(db: Database, sql: string, params: Array<string | number | null> = []): Array<Record<string, unknown>> {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const out: Array<Record<string, unknown>> = [];
    let cols: string[] | null = null;
    while (stmt.step()) {
      if (!cols) cols = stmt.getColumnNames();
      const vals = stmt.get();
      const r: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) r[cols[i]] = vals[i];
      out.push(r);
    }
    return out;
  } finally {
    stmt.free();
  }
}

export function periodFromRow(r: Record<string, unknown>): MgmtPeriod {
  const unit = r.manager_unit == null ? null : Number(r.manager_unit);
  return {
    id: String(r.id),
    buildingId: String(r.building_id),
    managerLabel: r.manager_label == null ? '' : String(r.manager_label),
    managerUnit: unit != null && Number.isInteger(unit) && unit > 0 ? unit : null,
    startDate: String(r.start_date),
    endDate: r.end_date == null ? '' : String(r.end_date),
    endedEarlyAt: (r.ended_early_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    hidden: Number(r.hidden) === 1,
  };
}

export function readPeriods(db: Database, buildingId?: string): MgmtPeriod[] {
  const rows = buildingId
    ? all(db, 'SELECT * FROM management_periods WHERE building_id = ? ORDER BY start_date DESC, id DESC', [buildingId])
    : all(db, 'SELECT * FROM management_periods ORDER BY start_date DESC, id DESC');
  return rows.map(periodFromRow);
}

export function getMgmtEnabled(db: Database, buildingId: string): boolean {
  const r = all(db, 'SELECT mgmt_enabled FROM buildings WHERE id = ?', [buildingId])[0];
  return Number(r?.mgmt_enabled) === 1;
}

export function setMgmtEnabled(db: Database, buildingId: string, enabled: boolean): void {
  db.run('UPDATE buildings SET mgmt_enabled = ? WHERE id = ?', [enabled ? 1 : 0, buildingId]);
}

export function readYearRows(db: Database, buildingId?: string): Array<BuildingYear & { buildingId: string }> {
  const rows = buildingId
    ? all(db, 'SELECT * FROM building_years WHERE building_id = ? ORDER BY year DESC', [buildingId])
    : all(db, 'SELECT * FROM building_years ORDER BY building_id, year');
  return rows.map((r) => ({
    buildingId: String(r.building_id),
    year: Number(r.year),
    closedAt: null, // بستن سال از ۱.۹.۱ حذف شده
    hidden: Number(r.hidden) === 1,
  }));
}

export function billYearCounts(db: Database, buildingId: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of all(db, 'SELECT year, count(*) AS n FROM bills WHERE building_id = ? AND deleted_at IS NULL GROUP BY year', [buildingId])) {
    m.set(Number(r.year), Number(r.n));
  }
  return m;
}

/** سال‌هایی که هر قبضی (حذف‌شده هم) دارند */
export function anyBillYears(db: Database, buildingId: string): Set<number> {
  return new Set(all(db, 'SELECT DISTINCT year FROM bills WHERE building_id = ?', [buildingId]).map((r) => Number(r.year)));
}

/** ردیفی از بستن سال (۱.۹.۰) مانده؟ */
export function hasClosedYearRows(db: Database, buildingId: string): boolean {
  return all(db, 'SELECT 1 AS x FROM building_years WHERE building_id = ? AND closed_at IS NOT NULL LIMIT 1', [buildingId]).length > 0;
}

/** مهاجرت ۱.۹.۱: بستن سال حذف شد → زمان بستن پاک می‌شود (پنهان بودن می‌ماند) */
export function clearClosedYears(db: Database, buildingId: string): void {
  db.run('UPDATE building_years SET closed_at = NULL WHERE building_id = ? AND closed_at IS NOT NULL', [buildingId]);
}

export function upsertYearRow(db: Database, buildingId: string, y: BuildingYear): void {
  db.run(
    `INSERT INTO building_years(building_id, year, closed_at, hidden) VALUES (?,?,?,?)
     ON CONFLICT(building_id, year) DO UPDATE SET closed_at = NULL, hidden = excluded.hidden`,
    [buildingId, y.year, null, y.hidden ? 1 : 0],
  );
}

export function deleteYearRow(db: Database, buildingId: string, year: number): void {
  db.run('DELETE FROM building_years WHERE building_id = ? AND year = ?', [buildingId, year]);
}

export function readBillPeriodId(db: Database, billId: string): { exists: boolean; periodId: string | null } {
  const r = all(db, 'SELECT mgmt_period_id FROM bills WHERE id = ?', [billId])[0];
  if (!r) return { exists: false, periodId: null };
  return { exists: true, periodId: (r.mgmt_period_id as string | null) ?? null };
}

/** دورهٔ قبضی تازه (وقتی کلید مدیر ساختمان روشن است) بر اساس زمان ثبت */
export function assignPeriodForNewBill(db: Database, buildingId: string, createdAtIso: string): string | null {
  if (!getMgmtEnabled(db, buildingId)) return null;
  return periodForCreatedAt(readPeriods(db, buildingId), createdAtIso)?.id ?? null;
}

/**
 * مهاجرت: قبض‌هایی که دوره ندارند، بر اساس تاریخ ثبت (created_at) به دورهٔ پوشش‌دهنده وصل می‌شوند.
 * اگر دوره‌ای پیدا نشد خالی می‌ماند (و قبض از نظر دوره قفل نمی‌شود). `onlyIds` = فقط این قبض‌ها.
 */
export function backfillBillPeriods(db: Database, onlyIds?: ReadonlySet<string>): number {
  const byBuilding = new Map<string, MgmtPeriod[]>();
  for (const p of readPeriods(db)) {
    const list = byBuilding.get(p.buildingId) ?? [];
    list.push(p);
    byBuilding.set(p.buildingId, list);
  }
  if (byBuilding.size === 0) return 0;
  let n = 0;
  const upd = db.prepare('UPDATE bills SET mgmt_period_id = ? WHERE id = ?');
  try {
    for (const r of all(db, 'SELECT id, building_id, created_at FROM bills WHERE mgmt_period_id IS NULL')) {
      const id = String(r.id);
      if (onlyIds && !onlyIds.has(id)) continue;
      const periods = byBuilding.get(String(r.building_id));
      if (!periods) continue;
      const p = periodForCreatedAt(periods, String(r.created_at));
      if (!p) continue;
      upd.run([p.id, id]);
      n++;
    }
  } finally {
    upd.free();
  }
  return n;
}

/**
 * مهاجرت دادهٔ شِمای ۸ برای دیتابیس موجود (بعد از replay ژورنال اجرا می‌شود):
 * کلید مدیر ساختمان برای همهٔ ساختمان‌های موجود روشن، و قبض‌های قدیمی به دوره‌ها وصل می‌شوند.
 */
export function migrateSchema8Data(db: Database): void {
  db.run('UPDATE buildings SET mgmt_enabled = 1');
  backfillBillPeriods(db);
}

/** id قبض‌های قفل این ساختمان (فقط دورهٔ مدیریتِ بسته) */
export function lockedBillIds(db: Database, buildingId: string, todayKey: string, isClosed: (p: MgmtPeriod) => boolean): Set<string> {
  const closedPeriods = new Set(readPeriods(db, buildingId).filter(isClosed).map((p) => p.id));
  void todayKey;
  const out = new Set<string>();
  if (closedPeriods.size === 0) return out;
  for (const r of all(db, 'SELECT id, mgmt_period_id FROM bills WHERE building_id = ? AND mgmt_period_id IS NOT NULL', [buildingId])) {
    if (closedPeriods.has(String(r.mgmt_period_id))) out.add(String(r.id));
  }
  return out;
}

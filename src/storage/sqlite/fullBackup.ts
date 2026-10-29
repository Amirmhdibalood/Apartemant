/**
 * Full-domain snapshot / replace for backup format 9 (all buildings, templates, bills, units,
 * payments, fund ledger, management periods, meetings + attendance).
 *
 * BACKUP_TABLE_COVERAGE lists every SQLite table and where it lives in a backup file; a test
 * compares it with sqlite_master so a new table can't silently be left out of backups.
 */
import type { Database, Statement } from 'sql.js';
import type { Bill, BuildingUnit, Unit } from '../../models/types';
import { migrateBill } from '../../logic/billPaid';
import { unitPayments } from '../../logic/payments';
import { newId } from '../../logic/id';
import { DEFAULT_BUILDING_ID } from './schema';
import { ident, requestCheckpoint } from './db';
import {
  ensureDefaultBuilding,
  inTransaction,
  readAllBills,
  readAllUnits,
  readUnitTemplates,
  type FundEntryRow,
  type ManagementPeriodRow,
  type MeetingAttendanceRow,
  type MeetingRow,
} from './domain';

/** table → backup section (or 'internal' = engine bookkeeping, intentionally not user data) */
export const BACKUP_TABLE_COVERAGE: Record<string, string> = {
  app_meta: 'internal',
  buildings: 'data.buildings[]',
  building_unit_templates: 'data.buildings[].units[]',
  bills: 'data.bills[] (+buildingId)',
  bill_units: 'data.units[]',
  payments: 'data.units[].payments[]',
  fund_entries: 'data.fundEntries[]',
  management_periods: 'data.managementPeriods[]',
  meetings: 'data.meetings[]',
  meeting_attendance: 'data.meetings[].attendance[]',
};

export interface FullBuilding {
  id: string;
  name: string;
  fundEnabled: boolean;
  createdAt: string;
  archivedAt: string | null;
  /** unit templates (تنظیمات ساختمان)، ترتیب = شماره واحد */
  units: BuildingUnit[];
}

export interface FullDomain {
  buildings: FullBuilding[];
  bills: Array<Bill & { buildingId: string }>;
  units: Unit[];
  fundEntries: FundEntryRow[];
  managementPeriods: ManagementPeriodRow[];
  meetings: MeetingRow[];
}

function rows(db: Database, sql: string): Array<Record<string, unknown>> {
  const stmt = db.prepare(sql);
  const out: Array<Record<string, unknown>> = [];
  let cols: string[] | null = null;
  while (stmt.step()) {
    if (!cols) cols = stmt.getColumnNames();
    const vals = stmt.get();
    const r: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) r[cols[i]] = vals[i];
    out.push(r);
  }
  stmt.free();
  return out;
}

const str = (v: unknown): string | null => (v == null ? null : String(v));

/** Read every user row from the DB (all buildings, archived included). */
export function readFullDomain(db: Database): FullDomain {
  ensureDefaultBuilding(db);
  const buildings: FullBuilding[] = rows(db, 'SELECT * FROM buildings ORDER BY created_at, id').map((r) => ({
    id: String(r.id),
    name: String(r.name),
    fundEnabled: Number(r.fund_enabled) === 1,
    createdAt: String(r.created_at),
    archivedAt: str(r.archived_at),
    units: readUnitTemplates(db, String(r.id))?.units ?? [],
  }));
  const bills = readAllBills(db);
  const units = readAllUnits(db);
  const fundEntries: FundEntryRow[] = rows(db, 'SELECT * FROM fund_entries ORDER BY created_at, id').map((r) => ({
    id: String(r.id),
    buildingId: String(r.building_id),
    kind: r.kind === 'withdraw' ? 'withdraw' : 'deposit',
    amount: Number(r.amount),
    reason: String(r.reason),
    relatedBillId: str(r.related_bill_id),
    relatedPaymentId: str(r.related_payment_id),
    note: str(r.note),
    createdAt: String(r.created_at),
  }));
  const managementPeriods: ManagementPeriodRow[] = rows(db, 'SELECT * FROM management_periods ORDER BY start_date, id').map((r) => ({
    id: String(r.id),
    buildingId: String(r.building_id),
    managerLabel: String(r.manager_label),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    endedEarlyAt: str(r.ended_early_at),
    notes: str(r.notes),
  }));
  const att = new Map<string, MeetingAttendanceRow[]>();
  for (const r of rows(db, 'SELECT meeting_id, unit_number, unit_alias, status FROM meeting_attendance ORDER BY meeting_id, unit_number')) {
    const s = r.status;
    if (s !== 'present' && s !== 'absent' && s !== 'empty') continue;
    const mid = String(r.meeting_id);
    const list = att.get(mid) ?? [];
    list.push({ unitNumber: Number(r.unit_number), unitAlias: str(r.unit_alias), status: s });
    att.set(mid, list);
  }
  const meetings: MeetingRow[] = rows(db, 'SELECT * FROM meetings ORDER BY meeting_date, created_at, id').map((r) => ({
    id: String(r.id),
    buildingId: String(r.building_id),
    meetingDate: String(r.meeting_date),
    weekday: String(r.weekday),
    hour: Number(r.hour),
    minute: Number(r.minute),
    place: str(r.place),
    summary: str(r.summary),
    createdAt: String(r.created_at),
    attendance: att.get(String(r.id)) ?? [],
  }));
  return { buildings, bills, units, fundEntries, managementPeriods, meetings };
}

/** Child tables first so deletes never trip a foreign key. */
const WIPE_ORDER = [
  'meeting_attendance', 'meetings', 'management_periods', 'fund_entries',
  'payments', 'bill_units', 'bills', 'building_unit_templates', 'buildings',
];

function withStmt<T>(db: Database, sql: string, fn: (s: Statement) => T): T {
  const s = db.prepare(sql);
  try { return fn(s); } finally { s.free(); }
}

const b01 = (v: boolean | undefined | null) => (v ? 1 : 0);

/**
 * Replace ALL domain rows with `full` in one transaction (on any error nothing changes).
 * Every row keeps its building; fund entries / periods / meetings are written verbatim.
 */
export function replaceFullDomain(db: Database, full: FullDomain): void {
  requestCheckpoint(); // bulk wipe + reinsert: persisted as one full snapshot
  inTransaction(db, () => {
    for (const t of WIPE_ORDER) db.run(`DELETE FROM ${ident(t)}`);

    withStmt(db, 'INSERT INTO buildings(id, name, fund_enabled, created_at, archived_at) VALUES (?,?,?,?,?)', (s) => {
      for (const b of full.buildings) s.run([b.id, b.name, b01(b.fundEnabled), b.createdAt, b.archivedAt ?? null]);
    });
    ensureDefaultBuilding(db);

    withStmt(db, `INSERT INTO building_unit_templates(id, building_id, unit_number, alias, default_persons, vacant, area, phone)
      VALUES (?,?,?,?,?,?,?,?)`, (s) => {
      for (const b of full.buildings) {
        b.units.forEach((u, i) => s.run([
          newId(), b.id, i + 1, u.alias ?? null, u.defaultPersons, b01(u.vacant), u.area ?? null, u.phone ?? null,
        ]));
      }
    });

    const billBuilding = new Map<string, string>();
    withStmt(db, `INSERT INTO bills(id, building_id, year, month, expense_type, bill_number, description, total_amount,
        created_at, is_fully_settled, split_method, bill_paid, bill_paid_date, due_date, deleted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, (s) => {
      for (const raw of full.bills) {
        const b = migrateBill(raw);
        const bid = raw.buildingId || DEFAULT_BUILDING_ID;
        billBuilding.set(b.id, bid);
        s.run([
          b.id, bid, b.year, b.month, b.expenseType, b.billNumber, b.description, b.totalAmount,
          b.createdAt, b01(b.isFullySettled), b.splitMethod ?? null, b01(b.billPaid), b.billPaidDate ?? null,
          b.dueDate ?? null, b.deletedAt ?? null,
        ]);
      }
    });

    withStmt(db, `INSERT INTO bill_units(id, bill_id, building_id, unit_number, person_count, alias, vacant, area, share_amount, is_settled)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, (su) => withStmt(db, `INSERT INTO payments(id, bill_unit_id, bill_id, building_id, amount, paid_at, batch_id)
      VALUES (?,?,?,?,?,?,?)`, (sp) => {
      for (const u of full.units) {
        const bid = billBuilding.get(u.billId);
        if (!bid) throw new Error(`unit ${u.id} has no bill`);
        su.run([u.id, u.billId, bid, u.unitNumber, u.personCount, u.alias ?? null, b01(u.vacant), u.area ?? null, u.shareAmount, b01(u.isSettled)]);
        for (const p of unitPayments(u)) sp.run([p.id, u.id, u.billId, bid, p.amount, p.paidAt ?? null, p.batchId ?? null]);
      }
    }));

    withStmt(db, `INSERT INTO fund_entries(id, building_id, kind, amount, reason, related_bill_id, related_payment_id, note, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, (s) => {
      for (const f of full.fundEntries) {
        s.run([f.id, f.buildingId, f.kind, f.amount, f.reason, f.relatedBillId ?? null, f.relatedPaymentId ?? null, f.note ?? null, f.createdAt]);
      }
    });

    withStmt(db, `INSERT INTO management_periods(id, building_id, manager_label, start_date, end_date, ended_early_at, notes)
      VALUES (?,?,?,?,?,?,?)`, (s) => {
      for (const p of full.managementPeriods) {
        s.run([p.id, p.buildingId, p.managerLabel, p.startDate, p.endDate, p.endedEarlyAt ?? null, p.notes ?? null]);
      }
    });

    withStmt(db, `INSERT INTO meetings(id, building_id, meeting_date, weekday, hour, minute, place, summary, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, (sm) => withStmt(db, `INSERT INTO meeting_attendance(id, meeting_id, unit_number, unit_alias, status)
      VALUES (?,?,?,?,?)`, (sa) => {
      for (const m of full.meetings) {
        sm.run([m.id, m.buildingId, m.meetingDate, m.weekday, m.hour, m.minute, m.place ?? null, m.summary ?? null, m.createdAt]);
        for (const a of m.attendance) sa.run([newId(), m.id, a.unitNumber, a.unitAlias ?? null, a.status]);
      }
    }));
  });
}

/** Names of all user tables in the DB (for the coverage test). */
export function listSqliteTables(db: Database): string[] {
  return rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => String(r.name));
}

/**
 * Row-level SQLite domain operations for buildings, bills, units, payments, fund.
 */
import type { Database } from 'sql.js';
import type { Bill, BuildingSettings, BuildingUnit, Payment, Unit } from '../../models/types';
import { migrateBill } from '../../logic/billPaid';
import { unitPayments } from '../../logic/payments';
import { newId } from '../../logic/id';
import { DEFAULT_BUILDING_ID, SQLITE_SCHEMA_VERSION } from './schema';
import { getMeta, setMeta } from './db';

export type BillRow = Bill & { buildingId: string };

function boolInt(v: boolean | undefined | null): number {
  return v ? 1 : 0;
}

export function ensureDefaultBuilding(db: Database, name = 'ساختمان ۱'): string {
  const stmt = db.prepare('SELECT id FROM buildings WHERE id = ?');
  stmt.bind([DEFAULT_BUILDING_ID]);
  const exists = stmt.step();
  stmt.free();
  if (!exists) {
    db.run(
      'INSERT INTO buildings(id, name, fund_enabled, created_at, archived_at) VALUES (?, ?, 0, ?, NULL)',
      [DEFAULT_BUILDING_ID, name, new Date().toISOString()],
    );
  }
  return DEFAULT_BUILDING_ID;
}

export function getBuildingFundEnabled(db: Database, buildingId: string): boolean {
  const stmt = db.prepare('SELECT fund_enabled FROM buildings WHERE id = ?');
  stmt.bind([buildingId]);
  let enabled = false;
  if (stmt.step()) enabled = Number(stmt.getAsObject().fund_enabled) === 1;
  stmt.free();
  return enabled;
}

export function setBuildingFundEnabled(db: Database, buildingId: string, enabled: boolean): void {
  db.run('UPDATE buildings SET fund_enabled = ? WHERE id = ?', [boolInt(enabled), buildingId]);
}

export function replaceUnitTemplates(db: Database, buildingId: string, settings: BuildingSettings): void {
  db.run('DELETE FROM building_unit_templates WHERE building_id = ?', [buildingId]);
  settings.units.forEach((u, i) => {
    db.run(
      `INSERT INTO building_unit_templates(id, building_id, unit_number, alias, default_persons, vacant, area, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        buildingId,
        i + 1,
        u.alias ?? null,
        u.defaultPersons,
        boolInt(!!u.vacant),
        u.area ?? null,
        u.phone ?? null,
      ],
    );
  });
}

export function readUnitTemplates(db: Database, buildingId: string): BuildingSettings | null {
  const stmt = db.prepare(
    'SELECT unit_number, alias, default_persons, vacant, area, phone FROM building_unit_templates WHERE building_id = ? ORDER BY unit_number',
  );
  stmt.bind([buildingId]);
  const units: BuildingUnit[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    const u: BuildingUnit = {
      alias: (r.alias as string | null) ?? null,
      defaultPersons: Number(r.default_persons) || 1,
    };
    if (Number(r.vacant) === 1) u.vacant = true;
    if (r.area != null && Number.isFinite(Number(r.area))) u.area = Number(r.area);
    if (typeof r.phone === 'string' && r.phone.trim()) u.phone = r.phone.trim();
    units.push(u);
  }
  stmt.free();
  return units.length ? { units } : null;
}

function billFromRow(r: Record<string, unknown>): BillRow {
  const bill = migrateBill({
    id: String(r.id),
    year: Number(r.year),
    month: Number(r.month),
    expenseType: r.expense_type as Bill['expenseType'],
    billNumber: (r.bill_number as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    totalAmount: Number(r.total_amount),
    createdAt: String(r.created_at),
    isFullySettled: Number(r.is_fully_settled) === 1,
    ...(r.split_method ? { splitMethod: r.split_method as Bill['splitMethod'] } : {}),
    billPaid: Number(r.bill_paid) === 1,
    billPaidDate: (r.bill_paid_date as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    deletedAt: (r.deleted_at as string | null) ?? null,
    buildingId: String(r.building_id),
  } as Bill & { buildingId: string });
  return { ...bill, buildingId: String(r.building_id) };
}

export function readAllBills(db: Database): BillRow[] {
  const stmt = db.prepare('SELECT * FROM bills');
  const out: BillRow[] = [];
  while (stmt.step()) out.push(billFromRow(stmt.getAsObject() as Record<string, unknown>));
  stmt.free();
  return out;
}

export function readPaymentsForUnits(db: Database, unitIds: string[]): Map<string, Payment[]> {
  const map = new Map<string, Payment[]>();
  if (unitIds.length === 0) return map;
  for (const id of unitIds) map.set(id, []);
  // Chunk IN queries for safety
  const chunk = 200;
  for (let i = 0; i < unitIds.length; i += chunk) {
    const part = unitIds.slice(i, i + chunk);
    const placeholders = part.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT * FROM payments WHERE bill_unit_id IN (${placeholders}) ORDER BY paid_at ASC`,
    );
    stmt.bind(part);
    while (stmt.step()) {
      const r = stmt.getAsObject() as Record<string, unknown>;
      const uid = String(r.bill_unit_id);
      const p: Payment = {
        id: String(r.id),
        amount: Number(r.amount),
        paidAt: (r.paid_at as string | null) ?? null,
      };
      if (r.batch_id) p.batchId = String(r.batch_id);
      map.get(uid)!.push(p);
    }
    stmt.free();
  }
  return map;
}

export function readAllUnits(db: Database): Unit[] {
  const stmt = db.prepare('SELECT * FROM bill_units');
  const rows: Array<Record<string, unknown>> = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  const payMap = readPaymentsForUnits(db, rows.map((r) => String(r.id)));
  return rows.map((r) => {
    const u: Unit = {
      id: String(r.id),
      billId: String(r.bill_id),
      unitNumber: Number(r.unit_number),
      personCount: Number(r.person_count),
      shareAmount: Number(r.share_amount),
      isSettled: Number(r.is_settled) === 1,
      payments: payMap.get(String(r.id)) ?? [],
    };
    if (r.alias != null) u.alias = String(r.alias);
    if (Number(r.vacant) === 1) u.vacant = true;
    if (r.area != null && Number.isFinite(Number(r.area))) u.area = Number(r.area);
    return u;
  });
}

export function upsertBillRow(db: Database, bill: Bill, buildingId: string): void {
  const b = migrateBill(bill);
  db.run(
    `INSERT INTO bills(
      id, building_id, year, month, expense_type, bill_number, description, total_amount,
      created_at, is_fully_settled, split_method, bill_paid, bill_paid_date, due_date, deleted_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      building_id=excluded.building_id, year=excluded.year, month=excluded.month,
      expense_type=excluded.expense_type, bill_number=excluded.bill_number,
      description=excluded.description, total_amount=excluded.total_amount,
      created_at=excluded.created_at, is_fully_settled=excluded.is_fully_settled,
      split_method=excluded.split_method, bill_paid=excluded.bill_paid,
      bill_paid_date=excluded.bill_paid_date, due_date=excluded.due_date,
      deleted_at=excluded.deleted_at`,
    [
      b.id,
      buildingId,
      b.year,
      b.month,
      b.expenseType,
      b.billNumber,
      b.description,
      b.totalAmount,
      b.createdAt,
      boolInt(b.isFullySettled),
      b.splitMethod ?? null,
      boolInt(!!b.billPaid),
      b.billPaidDate ?? null,
      b.dueDate ?? null,
      b.deletedAt ?? null,
    ],
  );
}

export function replaceUnitsForBill(
  db: Database,
  billId: string,
  buildingId: string,
  units: Unit[],
): void {
  // Capture previous payment ids for fund sync caller
  db.run('DELETE FROM payments WHERE bill_id = ?', [billId]);
  db.run('DELETE FROM bill_units WHERE bill_id = ?', [billId]);
  for (const u of units) {
    const unit: Unit = { ...u, billId };
    db.run(
      `INSERT INTO bill_units(
        id, bill_id, building_id, unit_number, person_count, alias, vacant, area, share_amount, is_settled
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        unit.id,
        billId,
        buildingId,
        unit.unitNumber,
        unit.personCount,
        unit.alias ?? null,
        boolInt(!!unit.vacant),
        unit.area ?? null,
        unit.shareAmount,
        boolInt(unit.isSettled),
      ],
    );
    for (const p of unitPayments(unit)) {
      db.run(
        `INSERT INTO payments(id, bill_unit_id, bill_id, building_id, amount, paid_at, batch_id)
         VALUES (?,?,?,?,?,?,?)`,
        [p.id, unit.id, billId, buildingId, p.amount, p.paidAt, p.batchId ?? null],
      );
    }
  }
}

export function updateBillFlags(db: Database, bill: Bill): void {
  const b = migrateBill(bill);
  db.run(
    `UPDATE bills SET is_fully_settled=?, bill_paid=?, bill_paid_date=?, due_date=?, deleted_at=?,
      year=?, month=?, expense_type=?, bill_number=?, description=?, total_amount=?,
      split_method=?, created_at=?
     WHERE id=?`,
    [
      boolInt(b.isFullySettled),
      boolInt(!!b.billPaid),
      b.billPaidDate ?? null,
      b.dueDate ?? null,
      b.deletedAt ?? null,
      b.year,
      b.month,
      b.expenseType,
      b.billNumber,
      b.description,
      b.totalAmount,
      b.splitMethod ?? null,
      b.createdAt,
      b.id,
    ],
  );
}

export function deleteBillCascade(db: Database, billId: string): void {
  db.run('DELETE FROM fund_entries WHERE related_bill_id = ?', [billId]);
  db.run('DELETE FROM payments WHERE bill_id = ?', [billId]);
  db.run('DELETE FROM bill_units WHERE bill_id = ?', [billId]);
  db.run('DELETE FROM bills WHERE id = ?', [billId]);
}

export function getBillBuildingId(db: Database, billId: string): string | null {
  const stmt = db.prepare('SELECT building_id FROM bills WHERE id = ?');
  stmt.bind([billId]);
  let id: string | null = null;
  if (stmt.step()) id = String(stmt.getAsObject().building_id);
  stmt.free();
  return id;
}

/** Sync fund deposits for building-charge payments when fund_enabled. */
export function syncFundDepositsForBill(
  db: Database,
  bill: Bill,
  buildingId: string,
  units: Unit[],
): void {
  const fundOn = getBuildingFundEnabled(db, buildingId);
  // Remove existing charge deposits for this bill always (rebuild or clear)
  db.run(
    `DELETE FROM fund_entries WHERE related_bill_id = ? AND reason = 'charge_bill' AND kind = 'deposit'`,
    [bill.id],
  );
  if (!fundOn || bill.expenseType !== 'building') return;
  for (const u of units) {
    for (const p of unitPayments(u)) {
      db.run(
        `INSERT INTO fund_entries(id, building_id, kind, amount, reason, related_bill_id, related_payment_id, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          newId(),
          buildingId,
          'deposit',
          p.amount,
          'charge_bill',
          bill.id,
          p.id,
          null,
          p.paidAt ?? new Date().toISOString(),
        ],
      );
    }
  }
}

export function markSqliteMigrationDone(db: Database, bills: number, units: number): void {
  setMeta(db, 'sqliteMigration', JSON.stringify({
    status: 'done',
    at: new Date().toISOString(),
    bills,
    units,
    from: 'idb_or_prefs',
  }));
  setMeta(db, 'schemaVersion', String(SQLITE_SCHEMA_VERSION));
}

export function isSqliteMigrationDone(db: Database): boolean {
  const raw = getMeta(db, 'sqliteMigration');
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { status?: string }).status === 'done';
  } catch {
    return false;
  }
}

export function replaceAllDomain(
  db: Database,
  buildingId: string,
  bills: Bill[],
  units: Unit[],
): void {
  ensureDefaultBuilding(db);
  db.run('DELETE FROM fund_entries');
  db.run('DELETE FROM payments');
  db.run('DELETE FROM bill_units');
  db.run('DELETE FROM bills');
  const byBill = new Map<string, Unit[]>();
  for (const u of units) {
    const arr = byBill.get(u.billId) ?? [];
    arr.push(u);
    byBill.set(u.billId, arr);
  }
  for (const bill of bills) {
    const bid = (bill as Bill & { buildingId?: string }).buildingId ?? buildingId;
    upsertBillRow(db, bill, bid);
    replaceUnitsForBill(db, bill.id, bid, byBill.get(bill.id) ?? []);
    syncFundDepositsForBill(db, bill, bid, byBill.get(bill.id) ?? []);
  }
}

export function fundBalance(db: Database, buildingId: string): number {
  const stmt = db.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN kind='deposit' THEN amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN kind='withdraw' THEN amount ELSE 0 END),0) AS bal
     FROM fund_entries WHERE building_id = ?`,
  );
  stmt.bind([buildingId]);
  let bal = 0;
  if (stmt.step()) bal = Number(stmt.getAsObject().bal) || 0;
  stmt.free();
  return bal;
}

export function listFundEntries(db: Database, buildingId: string): Array<Record<string, unknown>> {
  const stmt = db.prepare('SELECT * FROM fund_entries WHERE building_id = ? ORDER BY created_at');
  stmt.bind([buildingId]);
  const out: Array<Record<string, unknown>> = [];
  while (stmt.step()) out.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return out;
}

/* ─── Buildings (multi) ─── */

export interface BuildingRow {
  id: string;
  name: string;
  fundEnabled: boolean;
  createdAt: string;
  archivedAt: string | null;
}

export function listBuildings(db: Database, opts?: { includeArchived?: boolean }): BuildingRow[] {
  ensureDefaultBuilding(db);
  const sql = opts?.includeArchived
    ? 'SELECT * FROM buildings ORDER BY created_at'
    : 'SELECT * FROM buildings WHERE archived_at IS NULL ORDER BY created_at';
  const stmt = db.prepare(sql);
  const out: BuildingRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    out.push({
      id: String(r.id),
      name: String(r.name),
      fundEnabled: Number(r.fund_enabled) === 1,
      createdAt: String(r.created_at),
      archivedAt: (r.archived_at as string | null) ?? null,
    });
  }
  stmt.free();
  return out;
}

export function renameBuilding(db: Database, id: string, name: string): void {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'ساختمان';
  db.run('UPDATE buildings SET name = ? WHERE id = ?', [clean, id]);
}

export function createBuilding(db: Database, name: string, templates?: BuildingSettings): string {
  ensureDefaultBuilding(db);
  const id = newId();
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'ساختمان جدید';
  db.run(
    'INSERT INTO buildings(id, name, fund_enabled, created_at, archived_at) VALUES (?, ?, 0, ?, NULL)',
    [id, clean, new Date().toISOString()],
  );
  const units = templates ?? { units: [{ alias: null, defaultPersons: 1 }] };
  replaceUnitTemplates(db, id, units);
  return id;
}

export function archiveBuilding(db: Database, id: string): void {
  if (id === DEFAULT_BUILDING_ID) throw new Error('cannot archive default building');
  db.run('UPDATE buildings SET archived_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}

export function getBuildingName(db: Database, id: string): string | null {
  const stmt = db.prepare('SELECT name FROM buildings WHERE id = ?');
  stmt.bind([id]);
  let name: string | null = null;
  if (stmt.step()) name = String(stmt.getAsObject().name);
  stmt.free();
  return name;
}

/* ─── Fund ledger writes ─── */

export function addFundEntry(
  db: Database,
  entry: {
    buildingId: string;
    kind: 'deposit' | 'withdraw';
    amount: number;
    reason: string;
    relatedBillId?: string | null;
    relatedPaymentId?: string | null;
    note?: string | null;
    createdAt?: string;
  },
): string {
  if (!Number.isSafeInteger(entry.amount) || entry.amount <= 0) throw new Error('invalid fund amount');
  const id = newId();
  db.run(
    `INSERT INTO fund_entries(id, building_id, kind, amount, reason, related_bill_id, related_payment_id, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id,
      entry.buildingId,
      entry.kind,
      entry.amount,
      entry.reason,
      entry.relatedBillId ?? null,
      entry.relatedPaymentId ?? null,
      entry.note ?? null,
      entry.createdAt ?? new Date().toISOString(),
    ],
  );
  return id;
}

export type FundEntryRow = {
  id: string;
  buildingId: string;
  kind: 'deposit' | 'withdraw';
  amount: number;
  reason: string;
  relatedBillId: string | null;
  relatedPaymentId: string | null;
  note: string | null;
  createdAt: string;
};

export function readFundEntries(db: Database, buildingId: string): FundEntryRow[] {
  return listFundEntries(db, buildingId).map((r) => ({
    id: String(r.id),
    buildingId: String(r.building_id),
    kind: (r.kind === 'withdraw' ? 'withdraw' : 'deposit') as 'deposit' | 'withdraw',
    amount: Number(r.amount),
    reason: String(r.reason),
    relatedBillId: (r.related_bill_id as string | null) ?? null,
    relatedPaymentId: (r.related_payment_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

/* ─── Management periods ─── */

export type ManagementPeriodRow = {
  id: string;
  buildingId: string;
  managerLabel: string;
  startDate: string;
  endDate: string;
  endedEarlyAt: string | null;
  notes: string | null;
};

export function listManagementPeriods(db: Database, buildingId: string): ManagementPeriodRow[] {
  const stmt = db.prepare(
    'SELECT * FROM management_periods WHERE building_id = ? ORDER BY start_date DESC, id DESC',
  );
  stmt.bind([buildingId]);
  const out: ManagementPeriodRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    out.push({
      id: String(r.id),
      buildingId: String(r.building_id),
      managerLabel: String(r.manager_label),
      startDate: String(r.start_date),
      endDate: String(r.end_date),
      endedEarlyAt: (r.ended_early_at as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    });
  }
  stmt.free();
  return out;
}

export function insertManagementPeriod(
  db: Database,
  row: Omit<ManagementPeriodRow, 'id' | 'endedEarlyAt'> & { endedEarlyAt?: string | null },
): string {
  const id = newId();
  db.run(
    `INSERT INTO management_periods(id, building_id, manager_label, start_date, end_date, ended_early_at, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [
      id,
      row.buildingId,
      row.managerLabel.replace(/\s+/g, ' ').trim().slice(0, 80) || 'مدیر',
      row.startDate,
      row.endDate,
      row.endedEarlyAt ?? null,
      row.notes ?? null,
    ],
  );
  return id;
}

export function endManagementPeriodEarly(db: Database, id: string, atIso: string = new Date().toISOString()): void {
  db.run('UPDATE management_periods SET ended_early_at = ? WHERE id = ?', [atIso, id]);
}

export function deleteManagementPeriod(_db: Database, _id: string): void {
  throw new Error('management period delete is not allowed');
}

/* ─── Meetings (manager-only log) ─── */

export type MeetingAttendanceStatus = 'present' | 'absent' | 'empty';

export type MeetingAttendanceRow = {
  unitNumber: number;
  unitAlias: string | null;
  status: MeetingAttendanceStatus;
};

export type MeetingRow = {
  id: string;
  buildingId: string;
  meetingDate: string;
  weekday: string;
  hour: number;
  minute: number;
  place: string | null;
  summary: string | null;
  createdAt: string;
  attendance: MeetingAttendanceRow[];
};

function parseAttendanceStatus(s: unknown): MeetingAttendanceStatus | null {
  if (s === 'present' || s === 'absent' || s === 'empty') return s;
  return null;
}

export function listMeetings(db: Database, buildingId: string): MeetingRow[] {
  const stmt = db.prepare(
    'SELECT * FROM meetings WHERE building_id = ? ORDER BY meeting_date DESC, hour DESC, minute DESC, created_at DESC',
  );
  stmt.bind([buildingId]);
  const heads: Omit<MeetingRow, 'attendance'>[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    heads.push({
      id: String(r.id),
      buildingId: String(r.building_id),
      meetingDate: String(r.meeting_date),
      weekday: String(r.weekday),
      hour: Number(r.hour),
      minute: Number(r.minute),
      place: (r.place as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      createdAt: String(r.created_at),
    });
  }
  stmt.free();
  return heads.map((h) => ({ ...h, attendance: readMeetingAttendance(db, h.id) }));
}

export function getMeeting(db: Database, id: string): MeetingRow | null {
  const stmt = db.prepare('SELECT * FROM meetings WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();
  const mid = String(r.id);
  return {
    id: mid,
    buildingId: String(r.building_id),
    meetingDate: String(r.meeting_date),
    weekday: String(r.weekday),
    hour: Number(r.hour),
    minute: Number(r.minute),
    place: (r.place as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    createdAt: String(r.created_at),
    attendance: readMeetingAttendance(db, mid),
  };
}

function readMeetingAttendance(db: Database, meetingId: string): MeetingAttendanceRow[] {
  const stmt = db.prepare(
    'SELECT unit_number, unit_alias, status FROM meeting_attendance WHERE meeting_id = ? ORDER BY unit_number',
  );
  stmt.bind([meetingId]);
  const out: MeetingAttendanceRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    const status = parseAttendanceStatus(r.status);
    if (!status) continue;
    out.push({
      unitNumber: Number(r.unit_number),
      unitAlias: (r.unit_alias as string | null) ?? null,
      status,
    });
  }
  stmt.free();
  return out;
}

export function insertMeeting(
  db: Database,
  row: {
    buildingId: string;
    meetingDate: string;
    weekday: string;
    hour: number;
    minute: number;
    place?: string | null;
    summary?: string | null;
    attendance: MeetingAttendanceRow[];
  },
): string {
  if (!Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23) throw new Error('invalid meeting hour');
  if (!Number.isInteger(row.minute) || row.minute < 0 || row.minute > 59) throw new Error('invalid meeting minute');
  const id = newId();
  db.run(
    `INSERT INTO meetings(id, building_id, meeting_date, weekday, hour, minute, place, summary, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id,
      row.buildingId,
      row.meetingDate,
      row.weekday.slice(0, 20),
      row.hour,
      row.minute,
      row.place?.trim().slice(0, 120) || null,
      row.summary?.trim().slice(0, 4000) || null,
      new Date().toISOString(),
    ],
  );
  for (const a of row.attendance) {
    if (!parseAttendanceStatus(a.status)) continue;
    db.run(
      `INSERT INTO meeting_attendance(id, meeting_id, unit_number, unit_alias, status) VALUES (?,?,?,?,?)`,
      [newId(), id, a.unitNumber, a.unitAlias?.trim().slice(0, 80) || null, a.status],
    );
  }
  return id;
}

export function deleteMeeting(db: Database, id: string): void {
  db.run('DELETE FROM meetings WHERE id = ?', [id]);
}


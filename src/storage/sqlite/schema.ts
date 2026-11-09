/**
 * SQLite DDL for Apartemant domain DB.
 * 7 = per-building custom bill types; 8 = سال‌های هر ساختمان (building_years)، مدیر از واحدها،
 * کلید «مدیریت ساختمان» هر ساختمان و دورهٔ مدیریتِ هر قبض (bills.mgmt_period_id).
 */
export const SQLITE_SCHEMA_VERSION = 8;

/** پیش‌فرض قبض‌های واریزی به صندوق (JSON مرتب‌شده با EXPENSE_TYPE_ORDER) */
export const DEFAULT_FUND_TYPES_JSON = '["building"]';

export const DEFAULT_BUILDING_ID = 'building-default';

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  fund_enabled INTEGER NOT NULL DEFAULT 0,
  fund_types TEXT NOT NULL DEFAULT '["building"]',
  created_at TEXT NOT NULL,
  archived_at TEXT,
  mgmt_enabled INTEGER NOT NULL DEFAULT 0,
  default_year INTEGER
);

CREATE TABLE IF NOT EXISTS building_years (
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  closed_at TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(building_id, year)
);

CREATE TABLE IF NOT EXISTS building_unit_templates (
  id TEXT PRIMARY KEY NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_number INTEGER NOT NULL,
  alias TEXT,
  default_persons INTEGER NOT NULL DEFAULT 1,
  vacant INTEGER NOT NULL DEFAULT 0,
  area REAL,
  phone TEXT,
  UNIQUE(building_id, unit_number)
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  expense_type TEXT NOT NULL,
  bill_number TEXT,
  description TEXT,
  total_amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  is_fully_settled INTEGER NOT NULL DEFAULT 0,
  split_method TEXT,
  bill_paid INTEGER NOT NULL DEFAULT 0,
  bill_paid_date TEXT,
  due_date TEXT,
  deleted_at TEXT,
  mgmt_period_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_bills_building_ym ON bills(building_id, year, month);
CREATE INDEX IF NOT EXISTS idx_bills_deleted ON bills(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bills_expense ON bills(expense_type);

CREATE TABLE IF NOT EXISTS bill_units (
  id TEXT PRIMARY KEY NOT NULL,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  building_id TEXT NOT NULL REFERENCES buildings(id),
  unit_number INTEGER NOT NULL,
  person_count INTEGER NOT NULL,
  alias TEXT,
  vacant INTEGER NOT NULL DEFAULT 0,
  area REAL,
  share_amount INTEGER NOT NULL,
  is_settled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bill_units_bill ON bill_units(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_units_building_unit ON bill_units(building_id, unit_number);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  bill_unit_id TEXT NOT NULL REFERENCES bill_units(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  building_id TEXT NOT NULL REFERENCES buildings(id),
  amount INTEGER NOT NULL,
  paid_at TEXT,
  batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_unit ON payments(bill_unit_id);
CREATE INDEX IF NOT EXISTS idx_payments_batch ON payments(batch_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);

CREATE TABLE IF NOT EXISTS fund_entries (
  id TEXT PRIMARY KEY NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  related_bill_id TEXT,
  related_payment_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fund_building ON fund_entries(building_id);
CREATE INDEX IF NOT EXISTS idx_fund_payment ON fund_entries(related_payment_id);

CREATE TABLE IF NOT EXISTS management_periods (
  id TEXT PRIMARY KEY NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  manager_label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  ended_early_at TEXT,
  notes TEXT,
  manager_unit INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mgmt_building ON management_periods(building_id);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  meeting_date TEXT NOT NULL,
  weekday TEXT NOT NULL,
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  place TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_building ON meetings(building_id, meeting_date DESC);

CREATE TABLE IF NOT EXISTS meeting_attendance (
  id TEXT PRIMARY KEY NOT NULL,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  unit_number INTEGER NOT NULL,
  unit_alias TEXT,
  status TEXT NOT NULL,
  UNIQUE(meeting_id, unit_number)
);
CREATE INDEX IF NOT EXISTS idx_meet_att_meeting ON meeting_attendance(meeting_id);

CREATE TABLE IF NOT EXISTS bill_types (
  id TEXT PRIMARY KEY NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bill_types_building ON bill_types(building_id, sort_order);
`;

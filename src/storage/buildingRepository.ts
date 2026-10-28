/**
 * Buildings + unit templates + fund + management periods (SQLite) with active-building focus.
 */
import type { BuildingSettings } from '../models/types';
import { readJson, removeKey, writeJson } from './kvStore';
import { billRepository } from './billRepository';
import { buildingFromBills, defaultBuilding, sanitizeBuilding } from '../logic/building';
import { withSqlite, withSqliteWrite } from './sqlite/db';
import {
  addFundEntry,
  archiveBuilding,
  createBuilding,
  endManagementPeriodEarly,
  ensureDefaultBuilding,
  fundBalance,
  getBuildingFundEnabled,
  getBuildingName,
  insertManagementPeriod,
  listBuildings,
  listManagementPeriods,
  readFundEntries,
  readUnitTemplates,
  renameBuilding,
  replaceUnitTemplates,
  setBuildingFundEnabled,
  listMeetings,
  getMeeting,
  insertMeeting,
  deleteMeeting,
  type BuildingRow,
  type FundEntryRow,
  type ManagementPeriodRow,
  type MeetingRow,
  type MeetingAttendanceRow,
  type MeetingAttendanceStatus,
} from './sqlite/domain';
import { DEFAULT_BUILDING_ID } from './sqlite/schema';
import { ensureMigrated } from './migration';
import { activeBuildingStore } from './activeBuildingStore';

const LEGACY_KEY = 'building';
const LEGACY_TEMPLATE_KEY = 'unitTemplate';
const PREFS_PREFIX = 'buildingSettings.';

interface Stored extends BuildingSettings { updatedAt: string }

async function prefsKeyFor(buildingId: string): Promise<string> {
  return PREFS_PREFIX + buildingId;
}

export type { BuildingRow, FundEntryRow, ManagementPeriodRow, MeetingRow, MeetingAttendanceRow, MeetingAttendanceStatus };

export const buildingRepository = {
  async getActiveId(): Promise<string> {
    await ensureMigrated().catch(() => undefined);
    const id = await activeBuildingStore.getActiveId();
    const known = await withSqlite((db) => {
      ensureDefaultBuilding(db);
      return listBuildings(db).some((b) => b.id === id);
    });
    if (!known) {
      await activeBuildingStore.setActiveId(DEFAULT_BUILDING_ID);
      return DEFAULT_BUILDING_ID;
    }
    return id;
  },

  async setActiveId(id: string): Promise<void> {
    await activeBuildingStore.setActiveId(id);
    billRepository._resetCache();
  },

  async isMultiEnabled(): Promise<boolean> {
    return activeBuildingStore.isMultiEnabled();
  },

  async setMultiEnabled(on: boolean): Promise<void> {
    await activeBuildingStore.setMultiEnabled(on);
    billRepository._resetCache();
  },

  async list(): Promise<BuildingRow[]> {
    await ensureMigrated();
    return withSqlite((db) => listBuildings(db));
  },

  async create(name: string, copyTemplatesFromActive = true): Promise<string> {
    await ensureMigrated();
    const active = await this.getActiveId();
    const id = await withSqliteWrite(async (db) => {
      const templates = copyTemplatesFromActive
        ? (readUnitTemplates(db, active) ?? defaultBuilding())
        : defaultBuilding();
      return createBuilding(db, name, templates);
    });
    return id;
  },

  async rename(id: string, name: string): Promise<void> {
    await ensureMigrated();
    await withSqliteWrite((db) => { renameBuilding(db, id, name); });
  },

  async archive(id: string): Promise<void> {
    await ensureMigrated();
    const active = await this.getActiveId();
    await withSqliteWrite((db) => { archiveBuilding(db, id); });
    if (active === id) await this.setActiveId(DEFAULT_BUILDING_ID);
  },

  async getName(id?: string): Promise<string> {
    await ensureMigrated();
    const bid = id ?? await this.getActiveId();
    return withSqlite((db) => getBuildingName(db, bid) ?? 'ساختمان');
  },

  /** Unit templates for active (or given) building */
  async get(buildingId?: string): Promise<BuildingSettings> {
    await ensureMigrated().catch(() => undefined);
    const bid = buildingId ?? await this.getActiveId();

    // Prefer SQLite templates
    const fromDb = await withSqlite((db) => {
      ensureDefaultBuilding(db);
      return readUnitTemplates(db, bid);
    }).catch(() => null);
    if (fromDb) return fromDb;

    // Legacy single-building prefs → default building only
    if (bid === DEFAULT_BUILDING_ID) {
      const stored = sanitizeBuilding(await readJson<unknown>(LEGACY_KEY, null));
      if (stored) {
        await this.save(stored, bid);
        return stored;
      }
      const legacy = await readJson<{ personCounts?: unknown } | null>(LEGACY_TEMPLATE_KEY, null);
      const seeded = buildingFromBills(await billRepository.getAll(), legacy?.personCounts);
      await this.save(seeded, bid);
      await removeKey(LEGACY_TEMPLATE_KEY).catch(() => undefined);
      return seeded;
    }

    const seeded = defaultBuilding();
    await this.save(seeded, bid);
    return seeded;
  },

  async save(b: BuildingSettings, buildingId?: string): Promise<BuildingSettings> {
    const clean = sanitizeBuilding(b);
    if (!clean) throw new Error('invalid building settings');
    const bid = buildingId ?? await this.getActiveId();
    await ensureMigrated();
    await withSqliteWrite((db) => {
      ensureDefaultBuilding(db);
      replaceUnitTemplates(db, bid, clean);
    });
    // Mirror default building to legacy prefs for old backup paths
    if (bid === DEFAULT_BUILDING_ID) {
      await writeJson<Stored>(LEGACY_KEY, { ...clean, updatedAt: new Date().toISOString() });
    }
    await writeJson<Stored>(await prefsKeyFor(bid), { ...clean, updatedAt: new Date().toISOString() });
    return clean;
  },

  async replace(b: BuildingSettings): Promise<void> {
    await this.save(b, DEFAULT_BUILDING_ID);
    await removeKey(LEGACY_TEMPLATE_KEY).catch(() => undefined);
  },

  async getFundEnabled(buildingId?: string): Promise<boolean> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqlite((db) => {
      ensureDefaultBuilding(db);
      return getBuildingFundEnabled(db, bid);
    });
  },

  async setFundEnabled(enabled: boolean, buildingId?: string): Promise<void> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    await withSqliteWrite((db) => {
      ensureDefaultBuilding(db);
      setBuildingFundEnabled(db, bid, enabled);
    });
  },

  async getFundBalance(buildingId?: string): Promise<number> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqlite((db) => fundBalance(db, bid));
  },

  async listFundEntries(buildingId?: string): Promise<FundEntryRow[]> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqlite((db) => readFundEntries(db, bid));
  },

  async addFundWithdraw(amount: number, note: string | null, buildingId?: string): Promise<void> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    await withSqliteWrite((db) => {
      if (!getBuildingFundEnabled(db, bid)) throw new Error('fund disabled');
      const bal = fundBalance(db, bid);
      if (amount > bal) throw new Error('insufficient fund balance');
      addFundEntry(db, { buildingId: bid, kind: 'withdraw', amount, reason: 'expense', note });
    });
  },

  async addFundDepositManual(amount: number, note: string | null, buildingId?: string): Promise<void> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    await withSqliteWrite((db) => {
      if (!getBuildingFundEnabled(db, bid)) throw new Error('fund disabled');
      addFundEntry(db, { buildingId: bid, kind: 'deposit', amount, reason: 'manual', note });
    });
  },

  async listManagementPeriods(buildingId?: string): Promise<ManagementPeriodRow[]> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqlite((db) => listManagementPeriods(db, bid));
  },

  async addManagementPeriod(input: {
    managerLabel: string;
    startDate: string;
    endDate: string;
    notes?: string | null;
    endPreviousEarly?: boolean;
  }, buildingId?: string): Promise<string> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqliteWrite((db) => {
      if (input.endPreviousEarly) {
        for (const p of listManagementPeriods(db, bid)) {
          if (!p.endedEarlyAt) endManagementPeriodEarly(db, p.id);
        }
      }
      return insertManagementPeriod(db, {
        buildingId: bid,
        managerLabel: input.managerLabel,
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes ?? null,
      });
    });
  },

  async endManagementEarly(periodId: string): Promise<void> {
    await ensureMigrated();
    await withSqliteWrite((db) => { endManagementPeriodEarly(db, periodId); });
  },

  async removeManagementPeriod(_periodId: string): Promise<void> {
    // تاریخچهٔ مدیر حذف‌شدنی نیست (تصمیم مالک)
    throw new Error('management period delete is not allowed');
  },

  async listMeetings(buildingId?: string): Promise<MeetingRow[]> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqlite((db) => listMeetings(db, bid));
  },

  async getMeeting(id: string): Promise<MeetingRow | null> {
    await ensureMigrated();
    return withSqlite((db) => getMeeting(db, id));
  },

  async addMeeting(input: {
    meetingDate: string;
    weekday: string;
    hour: number;
    minute: number;
    place?: string | null;
    summary?: string | null;
    attendance: MeetingAttendanceRow[];
  }, buildingId?: string): Promise<string> {
    await ensureMigrated();
    const bid = buildingId ?? await this.getActiveId();
    return withSqliteWrite((db) => insertMeeting(db, {
      buildingId: bid,
      meetingDate: input.meetingDate,
      weekday: input.weekday,
      hour: input.hour,
      minute: input.minute,
      place: input.place ?? null,
      summary: input.summary ?? null,
      attendance: input.attendance,
    }));
  },

  async removeMeeting(id: string): Promise<void> {
    await ensureMigrated();
    await withSqliteWrite((db) => { deleteMeeting(db, id); });
  },

  onActiveChange(listener: () => void): () => void {
    return activeBuildingStore.onChange(listener);
  },
};


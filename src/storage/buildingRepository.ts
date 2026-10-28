/**
 * تنظیمات «ساختمان» — Preferences برای سازگاری UI + آینه در SQLite (building_unit_templates).
 * از ۱.۸.۰ جداول buildings / templates در SQLite وجود دارند؛ fund_enabled فعلاً فقط در SQLite.
 */
import type { BuildingSettings } from '../models/types';
import { readJson, removeKey, writeJson } from './kvStore';
import { billRepository } from './billRepository';
import { buildingFromBills, sanitizeBuilding } from '../logic/building';
import { withSqliteWrite } from './sqlite/db';
import { ensureDefaultBuilding, replaceUnitTemplates, setBuildingFundEnabled, getBuildingFundEnabled, readUnitTemplates } from './sqlite/domain';
import { DEFAULT_BUILDING_ID } from './sqlite/schema';
import { ensureMigrated } from './migration';

const KEY = 'building';
/** کلید «الگوی واحدها»ی نسخه‌های ۱.۲ تا ۱.۵ (فقط برای مهاجرت خوانده و سپس پاک می‌شود) */
const LEGACY_TEMPLATE_KEY = 'unitTemplate';

interface Stored extends BuildingSettings { updatedAt: string }

async function mirrorToSqlite(clean: BuildingSettings): Promise<void> {
  await ensureMigrated();
  await withSqliteWrite((db) => {
    ensureDefaultBuilding(db);
    replaceUnitTemplates(db, DEFAULT_BUILDING_ID, clean);
  });
}

export const buildingRepository = {
  async get(): Promise<BuildingSettings> {
    await ensureMigrated().catch(() => undefined);
    const stored = sanitizeBuilding(await readJson<unknown>(KEY, null));
    if (stored) {
      void mirrorToSqlite(stored).catch(() => undefined);
      return stored;
    }
    // Prefer SQLite templates if Preferences empty (restored / migrated)
    const fromDb = await withSqliteWrite((db) => {
      ensureDefaultBuilding(db);
      return readUnitTemplates(db, DEFAULT_BUILDING_ID);
    }).catch(() => null);
    if (fromDb) {
      await writeJson<Stored>(KEY, { ...fromDb, updatedAt: new Date().toISOString() });
      return fromDb;
    }
    const legacy = await readJson<{ personCounts?: unknown } | null>(LEGACY_TEMPLATE_KEY, null);
    const seeded = buildingFromBills(await billRepository.getAll(), legacy?.personCounts);
    await this.save(seeded);
    await removeKey(LEGACY_TEMPLATE_KEY).catch(() => undefined);
    return seeded;
  },

  async save(b: BuildingSettings): Promise<BuildingSettings> {
    const clean = sanitizeBuilding(b);
    if (!clean) throw new Error('invalid building settings');
    await writeJson<Stored>(KEY, { ...clean, updatedAt: new Date().toISOString() });
    await mirrorToSqlite(clean);
    return clean;
  },

  /** بازیابی پشتیبان: جایگزینی کامل */
  async replace(b: BuildingSettings): Promise<void> {
    await this.save(b);
    await removeKey(LEGACY_TEMPLATE_KEY).catch(() => undefined);
  },

  /** صندوق این ساختمان (پیش‌فرض خاموش) — ذخیره فقط در SQLite */
  async getFundEnabled(buildingId: string = DEFAULT_BUILDING_ID): Promise<boolean> {
    await ensureMigrated();
    return withSqliteWrite((db) => {
      ensureDefaultBuilding(db);
      return getBuildingFundEnabled(db, buildingId);
    });
  },

  async setFundEnabled(enabled: boolean, buildingId: string = DEFAULT_BUILDING_ID): Promise<void> {
    await ensureMigrated();
    await withSqliteWrite((db) => {
      ensureDefaultBuilding(db);
      setBuildingFundEnabled(db, buildingId, enabled);
    });
  },
};

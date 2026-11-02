/**
 * جمع‌آوری و جایگزینی کل داده‌های برنامه برای پشتیبان‌گیری/بازیابی.
 *
 * از قالب ۹ پشتیبان «کامل» است: همهٔ ساختمان‌ها (با تنظیمات واحدها و تلفن‌ها)، قبض‌ها/واحدها/پرداخت‌ها با ساختمان
 * خودشان، دفتر صندوق، دوره‌های مدیریت، جلسه‌ها و حالت چندساختمانی + تنظیمات و پیش‌فرض نحوه تقسیم.
 * بازیابی اتمی است: یک تراکنش SQLite + بازگرداندن تصویر قبلی دیتابیس و تنظیمات اگر هر مرحله‌ای شکست بخورد.
 *
 * ترجیح‌های همین گوشی (تم، پالت، نمادها، انواع فعال، نمایش گزارش‌ها، حالت متراژ/اعلان، آموزش اجرای اول)
 * عمداً داخل پشتیبان نیستند — فهرست کامل کلیدها در PREF_KEY_POLICY.
 */
import type { Database } from 'sql.js';
import type { AppSettings, Bill, BuildingSettings } from '../models/types';
import type { BackupData, BackupFile } from '../logic/backup';
import { createBackup, groupUnitsByBill, isFullBackupData, parseBackup } from '../logic/backup';
import { billRepository } from './billRepository';
import { settingsRepository } from './settingsRepository';
import { buildingRepository } from './buildingRepository';
import { billTypeRepository } from './billTypeRepository';
import { buildingFromBills, sanitizeBuilding } from '../logic/building';
import { sanitizeSplitDefaults } from '../logic/split';
import { splitDefaultsRepository } from './splitDefaultsRepository';
import { activeBuildingStore } from './activeBuildingStore';
import { readJson, removeKey, writeJson } from './kvStore';
import { ensureMigrationDone } from './migration';
import {
  deleteAux, exportCurrentBytes, openDetachedDatabase, readAuxBytes, readAuxText,
  replaceDatabaseWithBytes, setMeta, withSqlite, withSqliteWrite, writeAuxBytes, writeAuxText,
} from './sqlite/db';
import {
  ensureDefaultBuilding, isSqliteMigrationDone, listBuildings, markSqliteMigrationDone,
  replaceAllDomain, replaceUnitTemplates,
} from './sqlite/domain';
import { readFullDomain, replaceFullDomain, type FullDomain } from './sqlite/fullBackup';
import { DEFAULT_BUILDING_ID } from './sqlite/schema';
import { YEARS_SEEDED_META } from './sqlite/periodsSql';

/** کلید قدیمی نسخهٔ ایمنی (تا ۱.۸.۰ داخل Preferences بود؛ فقط خوانده و پاک می‌شود) */
const LEGACY_SAFETY_KEY = 'safetyBackup';
const LAST_BACKUP_KEY = 'lastBackupAt';
/** نسخهٔ ایمنی از ۱.۸: یک کپی SQLite + فایل کوچک مشخصات (هر دو کنار دیتابیس، نه در Preferences) */
const SAFETY_DB = 'safety-backup.db';
const SAFETY_META = 'safety-backup.json';

/**
 * همهٔ کلیدهای kvStore و جایگاهشان نسبت به پشتیبان.
 * 'backup' = داخل فایل پشتیبان؛ 'device' = ترجیح همین گوشی (عمداً بیرون)؛ 'internal' = دفترداری/آینه.
 * تست backupCoverage مطمئن می‌شود هر کلید تازه‌ای در src/storage اینجا طبقه‌بندی شده باشد.
 */
export const PREF_KEY_POLICY: Record<string, 'backup' | 'device' | 'internal'> = {
  settings: 'backup',
  splitDefaults: 'backup',
  multiBuildingEnabled: 'backup',
  activeBuildingId: 'backup',
  building: 'internal', // آینهٔ قدیمی تنظیمات ساختمان پیش‌فرض (منبع اصلی: SQLite)
  'buildingSettings.': 'internal', // آینهٔ تنظیمات هر ساختمان (منبع اصلی: SQLite)
  unitTemplate: 'internal', // الگوی واحدهای نسخه‌های خیلی قدیمی (فقط مهاجرت)
  safetyBackup: 'internal',
  lastBackupAt: 'internal',
  theme: 'device',
  periodsShowHidden: 'device', // «نمایش سال‌ها/دوره‌های پنهان» همین گوشی
  darkPalette: 'device',
  lightPalette: 'device',
  unitIcon: 'device',
  areaIcon: 'device',
  entryPrefs: 'device',
  reportPrefs: 'device',
  areaMode: 'device',
  notifMode: 'device',
  tutorialSeen: 'device',
};

/** کلیدهایی که بازیابی تغییر می‌دهد (برای برگرداندن در صورت شکست) */
const RESTORE_PREF_KEYS = ['settings', 'splitDefaults', 'multiBuildingEnabled', 'activeBuildingId', 'building', 'unitTemplate'] as const;

interface SafetyMeta {
  v: 1;
  createdAt: string;
  appVersion: string;
  bills: number;
  settings: AppSettings;
  splitDefaults: Record<string, string>;
  multiBuilding: { enabled: boolean; activeBuildingId: string };
}

export interface SafetyInfo {
  createdAt: string;
  appVersion: string;
  bills: number;
}

function fullToData(full: FullDomain, prefs: { settings: AppSettings; splitDefaults: Record<string, string>; multiBuilding: { enabled: boolean; activeBuildingId: string } }): BackupData {
  const def = full.buildings.find((b) => b.id === DEFAULT_BUILDING_ID);
  const building: BuildingSettings | undefined = def && def.units.length ? { units: def.units } : undefined;
  const split = sanitizeSplitDefaults(prefs.splitDefaults);
  return {
    bills: full.bills,
    units: full.units,
    settings: prefs.settings,
    ...(building ? { building } : {}),
    ...(Object.keys(split).length ? { splitDefaults: split } : {}),
    buildings: full.buildings,
    fundEntries: full.fundEntries,
    managementPeriods: full.managementPeriods,
    meetings: full.meetings,
    multiBuilding: { ...prefs.multiBuilding },
  };
}

async function readPrefs() {
  const [settings, splitDefaults, enabled, activeBuildingId] = await Promise.all([
    settingsRepository.get(),
    splitDefaultsRepository.get(),
    activeBuildingStore.isMultiEnabled(),
    activeBuildingStore.getActiveId(),
  ]);
  return { settings, splitDefaults: splitDefaults as Record<string, string>, multiBuilding: { enabled, activeBuildingId } };
}

async function snapshotPrefs(): Promise<Map<string, unknown>> {
  const m = new Map<string, unknown>();
  for (const k of RESTORE_PREF_KEYS) m.set(k, await readJson<unknown>(k, undefined));
  return m;
}

async function restorePrefs(m: Map<string, unknown>): Promise<void> {
  for (const [k, v] of m) {
    if (v === undefined) await removeKey(k);
    else await writeJson(k, v);
  }
}

/**
 * اجرای اتمی بازیابی: مرحلهٔ SQLite داخل یک تراکنش؛ اگر ذخیره یا نوشتن تنظیمات شکست بخورد،
 * تصویر قبلی دیتابیس و تنظیمات برگردانده می‌شود (هیچ چیز نیمه‌کاره نمی‌ماند).
 */
async function atomicRestore(sqliteStep: (db: Database) => void, prefsStep: () => Promise<void>): Promise<void> {
  await billRepository.warm().catch(() => undefined);
  await ensureMigrationDone();
  await billRepository.exclusive(async () => {
    const before = await exportCurrentBytes();
    const oldPrefs = await snapshotPrefs();
    try {
      await withSqliteWrite((db) => sqliteStep(db));
      await prefsStep();
    } catch (e) {
      await restorePrefs(oldPrefs).catch(() => undefined);
      await replaceDatabaseWithBytes(before).catch(() => undefined);
      throw e;
    }
  });
}

async function writeBuildingMirrors(buildings: { id: string; units: BuildingSettings['units'] }[]): Promise<void> {
  const now = new Date().toISOString();
  for (const b of buildings) {
    const clean = sanitizeBuilding({ units: b.units });
    if (!clean) continue;
    if (b.id === DEFAULT_BUILDING_ID) await writeJson('building', { ...clean, updatedAt: now });
    await writeJson(`buildingSettings.${b.id}`, { ...clean, updatedAt: now });
  }
}

/** بازیابی پشتیبان کامل (قالب ۹): همه‌چیز دقیقاً سر جای خودش */
async function restoreFull(data: BackupData & Required<Pick<BackupData, 'buildings' | 'fundEntries' | 'managementPeriods' | 'meetings'>>): Promise<void> {
  // پشتیبان قدیمی‌تر از ۱۲ سال‌های هر ساختمان را ندارد → بعد از بازیابی، ساختمانِ بدون سال
  // در اولین باز شدن از «سال‌های فعالِ» تنظیماتِ بازیابی‌شده پر می‌شود (periodsRepository.ensureSeeded)
  const full: FullDomain = {
    buildings: data.buildings,
    bills: data.bills.map((b) => ({ ...b, buildingId: b.buildingId || DEFAULT_BUILDING_ID })),
    units: data.units,
    fundEntries: data.fundEntries,
    managementPeriods: data.managementPeriods,
    meetings: data.meetings,
  };
  const ids = new Set(full.buildings.map((b) => b.id));
  const multi = data.multiBuilding ?? { enabled: false, activeBuildingId: DEFAULT_BUILDING_ID };
  await atomicRestore(
    (db) => {
      replaceFullDomain(db, full);
      setMeta(db, YEARS_SEEDED_META, '[]');
      if (!isSqliteMigrationDone(db)) markSqliteMigrationDone(db, full.bills.length, full.units.length);
    },
    async () => {
      await settingsRepository.save(data.settings);
      await splitDefaultsRepository.replace(data.splitDefaults ?? {});
      await writeJson('multiBuildingEnabled', multi.enabled === true);
      await writeJson('activeBuildingId', ids.has(multi.activeBuildingId) ? multi.activeBuildingId : DEFAULT_BUILDING_ID);
      await writeBuildingMirrors(full.buildings);
      await removeKey('unitTemplate').catch(() => undefined);
    },
  );
}

/** بازیابی قالب‌های ۱ تا ۸: دقیقاً مثل قبل (قبض‌ها در ساختمان پیش‌فرض، تنظیمات ساختمان پیش‌فرض) ولی اتمی */
async function restoreLegacy(data: BackupData): Promise<void> {
  // تنظیمات ساختمان (قالب‌های ۱ تا ۴ ندارند: از جدیدترین قبض حذف‌نشده، وگرنه unitTemplate، وگرنه ۱ واحد)
  const building = data.building
    ?? (() => {
      const byBill = groupUnitsByBill(data.units);
      return buildingFromBills(data.bills.map((bill) => ({ bill, units: byBill.get(bill.id) ?? [] })), data.unitTemplate);
    })();
  const clean = sanitizeBuilding(building);
  if (!clean) throw new Error('invalid building settings');
  await atomicRestore(
    (db) => {
      ensureDefaultBuilding(db);
      const known = new Set(listBuildings(db, { includeArchived: true }).map((b) => b.id));
      // قبض با buildingId ناشناخته (قالب ۸ از گوشی دیگر) هرگز گم نمی‌شود: به ساختمان پیش‌فرض می‌رود
      const bills = data.bills.map((b) => {
        const bid = (b as Bill).buildingId;
        return bid && known.has(bid) ? b : { ...b, buildingId: DEFAULT_BUILDING_ID };
      });
      replaceAllDomain(db, DEFAULT_BUILDING_ID, bills, data.units);
      replaceUnitTemplates(db, DEFAULT_BUILDING_ID, clean);
      if (!isSqliteMigrationDone(db)) markSqliteMigrationDone(db, bills.length, data.units.length);
    },
    async () => {
      await settingsRepository.save(data.settings);
      await writeBuildingMirrors([{ id: DEFAULT_BUILDING_ID, units: clean.units }]);
      await removeKey('unitTemplate').catch(() => undefined);
      // پشتیبان‌های قدیمی پیش‌فرض نحوه تقسیم ندارند (همه بر اساس نفرات)
      await splitDefaultsRepository.replace(data.splitDefaults ?? {});
    },
  );
}

export const backupRepository = {
  /** همه داده‌ها (قالب ۹): همهٔ ساختمان‌ها، قبض‌ها، واحدها، پرداخت‌ها، صندوق، دوره‌ها، جلسه‌ها، تنظیمات */
  async collect(): Promise<BackupData> {
    // ensures legacy single-building prefs are seeded into SQLite before reading
    await buildingRepository.get(DEFAULT_BUILDING_ID).catch(() => undefined);
    await billRepository.warm();
    await billRepository.flush();
    const [full, prefs] = await Promise.all([withSqlite((db) => readFullDomain(db)), readPrefs()]);
    return fullToData(full, prefs);
  },

  /** تعداد کل قبض‌ها (همهٔ ساختمان‌ها، حذف‌شده‌ها هم) بدون بارگذاری همه‌چیز */
  async countBills(): Promise<number> {
    await ensureMigrationDone();
    return withSqlite((db) => {
      const r = db.exec('SELECT COUNT(*) FROM bills');
      return Number(r[0]?.values[0]?.[0] ?? 0);
    });
  },

  /** آیا هیچ دادهٔ کاربری (قبض، صندوق، دوره، جلسه یا ساختمان دوم) هست؟ */
  async hasUserData(): Promise<boolean> {
    await ensureMigrationDone();
    return withSqlite((db) => {
      const stmt = db.prepare(`SELECT
        (SELECT COUNT(*) FROM bills) + (SELECT COUNT(*) FROM fund_entries) + (SELECT COUNT(*) FROM management_periods)
        + (SELECT COUNT(*) FROM meetings) + (SELECT COUNT(*) FROM bill_types) + (SELECT COUNT(*) FROM buildings WHERE id <> ?) AS n`);
      try {
        stmt.bind([DEFAULT_BUILDING_ID]);
        return stmt.step() && Number(stmt.get()[0]) > 0;
      } finally {
        stmt.free();
      }
    });
  },

  /** جایگزینی کامل داده‌های فعلی با داده‌های پشتیبان (اتمی) */
  async replaceAll(data: BackupData): Promise<void> {
    try {
      if (isFullBackupData(data)) await restoreFull(data);
      else await restoreLegacy(data);
    } finally {
      // نوع‌های سفارشی (و برچسب قبض‌ها) همیشه با دیتابیس هم‌خوان بمانند، چه بازیابی موفق شود چه برگردانده شود
      await billTypeRepository.refresh().catch(() => undefined);
    }
  },

  /**
   * نسخه ایمنی خودکار از داده‌های فعلی (قبل از بازیابی): کپی کامل SQLite در یک فایل کنار دیتابیس
   * (نه یک رشتهٔ بزرگ در Preferences) — با هر حجمی کار می‌کند و همه‌چیز را برمی‌گرداند.
   */
  async saveSafetyBackup(appVersion: string): Promise<void> {
    await billRepository.warm();
    await billRepository.flush();
    const prefs = await readPrefs();
    const bytes = await exportCurrentBytes();
    const bills = await this.countBills();
    // ترتیب: اول مشخصات قبلی پاک، بعد کپی، آخر مشخصات تازه (وجود مشخصات = کپی کامل است)
    await deleteAux(SAFETY_META);
    await writeAuxBytes(SAFETY_DB, bytes);
    const meta: SafetyMeta = { v: 1, createdAt: new Date().toISOString(), appVersion, bills, ...prefs };
    await writeAuxText(SAFETY_META, JSON.stringify(meta));
    await removeKey(LEGACY_SAFETY_KEY).catch(() => undefined);
  },

  /** مشخصات کوتاه نسخهٔ ایمنی (بدون بارگذاری خود داده‌ها) */
  async getSafetyInfo(): Promise<SafetyInfo | null> {
    const meta = await readSafetyMeta();
    if (meta) return { createdAt: meta.createdAt, appVersion: meta.appVersion, bills: meta.bills };
    const legacy = await readLegacySafety();
    return legacy ? { createdAt: legacy.createdAt, appVersion: legacy.appVersion, bills: legacy.data.bills.length } : null;
  },

  /** نسخهٔ ایمنی کامل (برای «برگرداندن اطلاعات قبل از آخرین بازیابی») */
  async getSafetyBackup(): Promise<BackupFile | null> {
    const meta = await readSafetyMeta();
    if (meta) {
      const bytes = await readAuxBytes(SAFETY_DB);
      if (!bytes) return null;
      const temp = await openDetachedDatabase(bytes);
      try {
        const data = fullToData(readFullDomain(temp), meta);
        return createBackup(data, meta.appVersion, new Date(meta.createdAt));
      } finally {
        temp.close();
      }
    }
    return readLegacySafety();
  },

  async clearSafetyBackup(): Promise<void> {
    await deleteAux(SAFETY_META);
    await deleteAux(SAFETY_DB);
    await removeKey(LEGACY_SAFETY_KEY);
  },

  async getLastBackupAt(): Promise<string | null> {
    return readJson<string | null>(LAST_BACKUP_KEY, null);
  },

  async setLastBackupAt(iso: string): Promise<void> {
    await writeJson(LAST_BACKUP_KEY, iso);
  },
};

async function readSafetyMeta(): Promise<SafetyMeta | null> {
  const text = await readAuxText(SAFETY_META);
  if (!text) return null;
  try {
    const m = JSON.parse(text) as SafetyMeta;
    return m && m.v === 1 && typeof m.createdAt === 'string' ? m : null;
  } catch {
    return null;
  }
}

async function readLegacySafety(): Promise<BackupFile | null> {
  const text = await readJson<string | null>(LEGACY_SAFETY_KEY, null);
  if (!text) return null;
  const r = parseBackup(text);
  return r.ok ? r.backup : null;
}

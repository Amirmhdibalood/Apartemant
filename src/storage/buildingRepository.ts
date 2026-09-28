/**
 * تنظیمات «ساختمان» (از نسخه ۱.۶.۰) در حافظه محلی.
 * در اولین اجرای نسخه ۱.۶.۰ (نبود کلید) تنظیمات از واحدهای جدیدترین قبض حذف‌نشده ساخته و ذخیره می‌شود.
 */
import type { BuildingSettings } from '../models/types';
import { readJson, removeKey, writeJson } from './kvStore';
import { billRepository } from './billRepository';
import { buildingFromBills, sanitizeBuilding } from '../logic/building';

const KEY = 'building';
/** کلید «الگوی واحدها»ی نسخه‌های ۱.۲ تا ۱.۵ (فقط برای مهاجرت خوانده و سپس پاک می‌شود) */
const LEGACY_TEMPLATE_KEY = 'unitTemplate';

interface Stored extends BuildingSettings { updatedAt: string }

export const buildingRepository = {
  async get(): Promise<BuildingSettings> {
    const stored = sanitizeBuilding(await readJson<unknown>(KEY, null));
    if (stored) return stored;
    // مهاجرت اولین اجرا
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
    return clean;
  },

  /** بازیابی پشتیبان: جایگزینی کامل */
  async replace(b: BuildingSettings): Promise<void> {
    await this.save(b);
    await removeKey(LEGACY_TEMPLATE_KEY).catch(() => undefined);
  },
};

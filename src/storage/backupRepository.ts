/** جمع‌آوری و جایگزینی کل داده‌های برنامه برای پشتیبان‌گیری/بازیابی */
import type { BackupData, BackupFile } from '../logic/backup';
import { createBackup, parseBackup, serializeBackup } from '../logic/backup';
import { billRepository } from './billRepository';
import { settingsRepository } from './settingsRepository';
import { unitTemplateRepository } from './unitTemplateRepository';
import { readJson, removeKey, writeJson } from './kvStore';

const SAFETY_KEY = 'safetyBackup';
const LAST_BACKUP_KEY = 'lastBackupAt';

export const backupRepository = {
  /** همه داده‌ها: قبض‌ها، واحدها، تنظیمات (سال‌ها و هشدارهای «دیگر نمایش نده») و الگوی واحدها */
  async collect(): Promise<BackupData> {
    const [tables, settings, unitTemplate] = await Promise.all([
      billRepository.exportTables(),
      settingsRepository.get(),
      unitTemplateRepository.get(),
    ]);
    return { bills: tables.bills, units: tables.units, settings, ...(unitTemplate ? { unitTemplate } : {}) };
  },

  /** جایگزینی کامل داده‌های فعلی با داده‌های پشتیبان */
  async replaceAll(data: BackupData): Promise<void> {
    await billRepository.replaceAll(data.bills, data.units);
    await settingsRepository.save(data.settings);
    // پشتیبان قالب ۱ الگو ندارد: الگو پاک می‌شود تا از آخرین قبض بازیابی‌شده ساخته شود
    if (data.unitTemplate && data.unitTemplate.length > 0) await unitTemplateRepository.save(data.unitTemplate);
    else await unitTemplateRepository.clear();
  },

  /** نسخه ایمنی خودکار از داده‌های فعلی (قبل از بازیابی) */
  async saveSafetyBackup(appVersion: string): Promise<void> {
    const backup = createBackup(await this.collect(), appVersion);
    await writeJson(SAFETY_KEY, serializeBackup(backup));
  },

  async getSafetyBackup(): Promise<BackupFile | null> {
    const text = await readJson<string | null>(SAFETY_KEY, null);
    if (!text) return null;
    const r = parseBackup(text);
    return r.ok ? r.backup : null;
  },

  async clearSafetyBackup(): Promise<void> {
    await removeKey(SAFETY_KEY);
  },

  async getLastBackupAt(): Promise<string | null> {
    return readJson<string | null>(LAST_BACKUP_KEY, null);
  },

  async setLastBackupAt(iso: string): Promise<void> {
    await writeJson(LAST_BACKUP_KEY, iso);
  },
};

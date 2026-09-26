/** ذخیره «الگوی واحدها» (واحدهای آخرین قبض ذخیره‌شده) در حافظه محلی */
import { readJson, removeKey, writeJson } from './kvStore';
import { billRepository } from './billRepository';
import { sanitizeUnitTemplate, templateFromBills } from '../logic/unitTemplate';

const KEY = 'unitTemplate';

interface Stored { personCounts: number[]; updatedAt: string }

export const unitTemplateRepository = {
  /** الگوی فعلی: الگوی ذخیره‌شده، وگرنه واحدهای جدیدترین قبض (برای کاربران نسخه‌های قبلی)، وگرنه null */
  async get(): Promise<number[] | null> {
    const stored = await readJson<Stored | null>(KEY, null);
    const fromStore = sanitizeUnitTemplate(stored?.personCounts);
    if (fromStore) return fromStore;
    return templateFromBills(await billRepository.getAll());
  },

  /** پس از هر ذخیره قبض، واحدهای همان قبض الگوی پیش‌فرض بعدی می‌شوند */
  async save(personCounts: number[]): Promise<void> {
    const clean = sanitizeUnitTemplate(personCounts);
    if (!clean) return;
    await writeJson<Stored>(KEY, { personCounts: clean, updatedAt: new Date().toISOString() });
  },

  async clear(): Promise<void> {
    await removeKey(KEY);
  },
};

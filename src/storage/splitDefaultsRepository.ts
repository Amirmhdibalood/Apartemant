/** آخرین نحوه تقسیم استفاده‌شده برای هر نوع هزینه (پیش‌فرض قبض‌های بعدی همان نوع) */
import type { ExpenseType, SplitMethod } from '../models/types';
import { readJson, removeKey, writeJson } from './kvStore';
import { sanitizeSplitDefaults, type SplitDefaults } from '../logic/split';

const KEY = 'splitDefaults';

export const splitDefaultsRepository = {
  async get(): Promise<SplitDefaults> {
    return sanitizeSplitDefaults(await readJson<unknown>(KEY, {}));
  },
  async remember(type: ExpenseType, method: SplitMethod): Promise<void> {
    const cur = await this.get();
    await writeJson(KEY, { ...cur, [type]: method });
  },
  async replace(defaults: SplitDefaults): Promise<void> {
    const clean = sanitizeSplitDefaults(defaults);
    if (Object.keys(clean).length === 0) await removeKey(KEY);
    else await writeJson(KEY, clean);
  },
};

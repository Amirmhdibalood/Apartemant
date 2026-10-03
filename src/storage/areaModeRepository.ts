/** نحوه نمایش متراژ؛ عمداً داخل فایل پشتیبان نیست (ترجیح همین گوشی است، مثل تم). */
import { readJson, writeJson } from './kvStore';
import { DEFAULT_AREA_MODE, sanitizeAreaMode, type AreaMode } from '../logic/areaMode';

const KEY = 'areaMode';

export const areaModeRepository = {
  async get(): Promise<AreaMode> {
    return sanitizeAreaMode(await readJson<unknown>(KEY, null)) ?? DEFAULT_AREA_MODE;
  },
  async save(mode: AreaMode): Promise<void> {
    await writeJson(KEY, mode);
  },
};

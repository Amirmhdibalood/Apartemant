/** نماد واحد و نماد متراژ؛ عمداً داخل فایل پشتیبان نیستند (ترجیح همین گوشی است، مثل تم). هرکدام کلید جدا دارند. */
import { readJson, writeJson } from './kvStore';
import {
  DEFAULT_AREA_ICON, DEFAULT_UNIT_ICON, sanitizeAreaIcon, sanitizeUnitIcon, type AreaIconId, type UnitIconId,
} from '../logic/iconPrefs';

export const UNIT_ICON_KEY = 'unitIcon';
export const AREA_ICON_KEY = 'areaIcon';

export const iconPrefsRepository = {
  async getUnitIcon(): Promise<UnitIconId> {
    return sanitizeUnitIcon(await readJson<unknown>(UNIT_ICON_KEY, null)) ?? DEFAULT_UNIT_ICON;
  },
  async saveUnitIcon(id: UnitIconId): Promise<void> {
    await writeJson(UNIT_ICON_KEY, id);
  },
  async getAreaIcon(): Promise<AreaIconId> {
    return sanitizeAreaIcon(await readJson<unknown>(AREA_ICON_KEY, null)) ?? DEFAULT_AREA_ICON;
  },
  async saveAreaIcon(id: AreaIconId): Promise<void> {
    await writeJson(AREA_ICON_KEY, id);
  },
};

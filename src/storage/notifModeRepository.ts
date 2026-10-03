/** نحوه نمایش اعلان‌ها؛ عمداً داخل فایل پشتیبان نیست (ترجیح همین گوشی است، مثل تم). */
import { readJson, writeJson } from './kvStore';
import { DEFAULT_NOTIF_MODE, sanitizeNotifMode, type NotifMode } from '../logic/notifMode';

const KEY = 'notifMode';

export const notifModeRepository = {
  async get(): Promise<NotifMode> {
    return sanitizeNotifMode(await readJson<unknown>(KEY, null)) ?? DEFAULT_NOTIF_MODE;
  },
  async save(mode: NotifMode): Promise<void> {
    await writeJson(KEY, mode);
  },
};

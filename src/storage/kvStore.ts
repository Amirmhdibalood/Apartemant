/**
 * لایه پایه ذخیره‌سازی کلید/مقدار.
 * روی اندروید از @capacitor/preferences (SharedPreferences) استفاده می‌کند
 * و در مرورگر خودِ پلاگین به localStorage برمی‌گردد. داده‌ها با بستن برنامه پاک نمی‌شوند.
 */
import { Preferences } from '@capacitor/preferences';

const PREFIX = 'bc.';

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key: PREFIX + key });
    if (value == null) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, value: T): Promise<void> {
  await Preferences.set({ key: PREFIX + key, value: JSON.stringify(value) });
}

export async function removeKey(key: string): Promise<void> {
  await Preferences.remove({ key: PREFIX + key });
}

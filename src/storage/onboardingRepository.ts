/**
 * آموزش اجرای اول (از نسخه ۱.۶.۳): پس از نصب، فقط یک‌بار در اولین اجرا آموزش خودکار نمایش داده می‌شود.
 * پرچم `tutorialSeen` در kvStore ذخیره می‌شود و عمداً داخل فایل پشتیبان نیست؛
 * بازیابی پشتیبان آن را دست نمی‌زند، پس هرگز دوباره آموزش را باز نمی‌کند (بی‌ضرر).
 * کاربرانی که از نسخه‌های قبلی به‌روزرسانی می‌کنند (قبض ذخیره‌شده دارند) آموزش خودکار نمی‌بینند.
 */
import { readJson, writeJson } from './kvStore';
import { billRepository } from './billRepository';

const KEY = 'tutorialSeen';

export const onboardingRepository = {
  /**
   * آیا باید آموزش را خودکار نشان داد؟ (فقط یک‌بار true می‌دهد؛ پرچم همان لحظه ذخیره می‌شود
   * تا حتی اگر برنامه وسط آموزش بسته شود، دوباره باز نشود.)
   */
  async consumeFirstRun(): Promise<boolean> {
    try {
      if (await readJson<boolean>(KEY, false)) return false;
      const hasData = (await billRepository.getAll()).length > 0;
      await writeJson(KEY, true);
      return !hasData;
    } catch {
      return false;
    }
  },
};

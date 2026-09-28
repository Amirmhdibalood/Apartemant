/**
 * زمان‌بندی اعلان محلی «یادآوری مهلت پرداخت» (از نسخه ۱.۵.۰) با @capacitor/local-notifications — کاملاً آفلاین.
 * - یک روز قبل از مهلت پرداخت ساعت ۹:۰۰ (محاسبه در logic/dueReminders.ts).
 * - زمان‌بندی غیردقیق (بدون مجوز SCHEDULE_EXACT_ALARM؛ اندروید ممکن است چند دقیقه جابه‌جا نمایش دهد).
 * - مجوز POST_NOTIFICATIONS (اندروید ۱۳+) فقط هنگام اولین ذخیره مهلت پرداخت درخواست می‌شود.
 * - با هر تغییر قبض‌ها (ذخیره، پرداخت شد، مهلت، حذف، بازگردانی، بازیابی پشتیبان) و هنگام اجرای برنامه همه یادآوری‌ها
 *   لغو و دوباره زمان‌بندی می‌شوند (فقط اعلان‌های این برنامه).
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { billRepository } from '../storage/billRepository';
import { planReminders, REMINDER_CHANNEL_ID } from '../logic/dueReminders';

let channelReady = false;
let running: Promise<void> | null = null;
let again = false;

async function ensureChannel() {
  if (channelReady || Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: 'یادآوری مهلت پرداخت قبض',
    description: 'یک روز قبل از مهلت پرداخت قبض‌های پرداخت‌نشده',
    importance: 4,
    visibility: 1,
  }).catch(() => undefined);
  channelReady = true;
}

async function granted(): Promise<boolean> {
  const p = await LocalNotifications.checkPermissions();
  return p.display === 'granted';
}

/** درخواست مجوز نمایش اعلان (فقط اگر هنوز از کاربر پرسیده نشده باشد) */
export async function ensureReminderPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    if (p.display === 'denied') return false;
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch {
    return false;
  }
}

async function syncOnce(): Promise<void> {
  if (!(await granted())) return;
  await ensureChannel();
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  const bills = (await billRepository.getAll()).map((x) => x.bill);
  const plan = planReminders(bills, new Date());
  if (!plan.length) return;
  await LocalNotifications.schedule({
    notifications: plan.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      largeBody: r.body,
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: 'ic_stat_apartemant',
      iconColor: '#2F74F0',
      schedule: { at: r.at, allowWhileIdle: false },
      extra: { billId: r.billId },
    })),
  });
}

/** لغو و زمان‌بندی دوباره همه یادآوری‌ها (فراخوانی‌های هم‌زمان پشت سر هم اجرا می‌شوند) */
export function syncDueReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      try { await syncOnce(); } catch { /* اعلان اختیاری است؛ خطا نباید برنامه را مختل کند */ }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

/** شروع: همگام‌سازی هنگام اجرای برنامه و پس از هر تغییر قبض‌ها */
export function startDueReminderSync(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  void syncDueReminders();
  return billRepository.onChange(() => { void syncDueReminders(); });
}

/**
 * خروجی گرفتن از پشتیبان — منطق خالص و قابل تست (وابستگی‌های پلتفرم تزریق می‌شوند).
 *
 * چه چیزی قابل تشخیص است؟ (اندروید، @capacitor/share ۸)
 * - Share.share از `Intent.createChooser` + `startActivityForResult` استفاده می‌کند.
 *   • بستن پنجره اشتراک‌گذاری بدون انتخاب مقصد (Back / لمس بیرون) ← نتیجهٔ RESULT_CANCELED و برنامه Stop نشده ← promise با خطای «Share canceled» رد می‌شود (قابل تشخیص).
 *   • انتخاب یک مقصد (تلگرام، Drive، مدیر فایل، ...) ← برنامه به پس‌زمینه می‌رود؛ هنگام بازگشت promise «موفق» می‌شود و
 *     `activityType` = نام بستهٔ برنامهٔ انتخاب‌شده است (از BroadcastReceiver). اندروید برای ACTION_SEND نتیجهٔ نهایی را از مقصد نمی‌گیرد؛
 *     پس اینکه کاربر در خودِ تلگرام/Drive ارسال یا ذخیره را کامل کرد یا همان‌جا لغو کرد، قابل تشخیص نیست.
 *   • نتیجهٔ موفق بدون `activityType` (مقصدی گزارش نشد) ← تأییدشده حساب نمی‌شود.
 * - نوشتن فایل (Cache/Documents) با خواندن مشخصات فایل (stat) و تطبیق اندازه تأیید می‌شود.
 */
import type { AppError } from './errors';

export const BACKUP_FAIL_TITLE = 'پشتیبان‌گیری موفقیت‌آمیز نبود';
export const BACKUP_FAIL_SAVE = 'فایل ذخیره نشد';
export const BACKUP_FAIL_SHARE = 'فایل به اشتراک گذاشته نشد';

export interface ShareOutcome { activityType?: string }

export interface ExportDeps {
  /** مرورگر (توسعه): دانلود مستقیم */
  isNative: boolean;
  download: (fileName: string, json: string) => void;
  /** ذخیرهٔ یک نسخه در Documents/Apartemant؛ مسیر نمایشی یا null (و بدون خطا) */
  saveCopy: (fileName: string, json: string) => Promise<string | null>;
  /** نوشتن فایل موقت برای اشتراک‌گذاری؛ uri را برمی‌گرداند و اگر نوشته/تأیید نشود خطا می‌دهد */
  writeTemp: (fileName: string, json: string) => Promise<string>;
  share: (uri: string) => Promise<ShareOutcome | undefined>;
}

export type ExportResult =
  | { ok: true; sharedWith: string | null; savedPath: string | null }
  | { ok: false; reason: 'saveFailed' | 'shareCancelled' | 'error'; detail: string; savedPath: string | null };

/** آیا خطای اشتراک‌گذاری یعنی کاربر پنجره را بست؟ */
export function isShareCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('cancel') || msg.includes('dismiss');
}

/** پیام خطا برای نمایش: دلیل مشخص یا متن خطای واقعی */
function errorDetail(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? '').trim();
  return m === '' ? 'خطای ناشناخته' : m;
}

export async function performBackupExport(deps: ExportDeps, fileName: string, json: string): Promise<ExportResult> {
  if (!deps.isNative) {
    try {
      deps.download(fileName, json);
      return { ok: true, sharedWith: null, savedPath: null };
    } catch (e) {
      return { ok: false, reason: 'error', detail: errorDetail(e), savedPath: null };
    }
  }

  let savedPath: string | null = null;
  try {
    savedPath = await deps.saveCopy(fileName, json);
  } catch {
    savedPath = null;
  }

  let uri: string;
  try {
    uri = await deps.writeTemp(fileName, json);
  } catch (e) {
    // فایل حتی برای اشتراک‌گذاری ساخته نشد
    return { ok: false, reason: 'saveFailed', detail: errorDetail(e), savedPath };
  }

  try {
    const res = await deps.share(uri);
    const app = (res?.activityType ?? '').trim();
    if (app === '') return { ok: false, reason: 'shareCancelled', detail: BACKUP_FAIL_SHARE, savedPath };
    return { ok: true, sharedWith: app, savedPath };
  } catch (e) {
    if (isShareCancel(e)) return { ok: false, reason: 'shareCancelled', detail: BACKUP_FAIL_SHARE, savedPath };
    return { ok: false, reason: 'error', detail: errorDetail(e), savedPath };
  }
}

/** متن دلیل برای کاربر (فارسی) */
export function failureReason(r: Extract<ExportResult, { ok: false }>): string {
  if (r.reason === 'saveFailed') return BACKUP_FAIL_SAVE;
  if (r.reason === 'shareCancelled') return BACKUP_FAIL_SHARE;
  return r.detail;
}

/** خطای قابل نمایش در ErrorDialog: عنوان «پشتیبان‌گیری موفقیت‌آمیز نبود» + دلیل (+ یادداشت نسخهٔ محلی در صورت وجود) */
export function exportFailureError(r: Extract<ExportResult, { ok: false }>): AppError {
  const reason = failureReason(r);
  const note = r.savedPath ? ` (یک نسخه فقط روی همین گوشی در ${r.savedPath} ذخیره شده است؛ بیرون از گوشی نگه داشته نشده.)` : '';
  return { code: 'BACKUP_FAILED', title: BACKUP_FAIL_TITLE, message: `${reason}.${note}` };
}

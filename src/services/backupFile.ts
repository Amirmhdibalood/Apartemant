/**
 * خروجی گرفتن از فایل پشتیبان روی پلتفرم‌های مختلف (کاملاً آفلاین):
 * - اندروید: نوشتن فایل در Cache برنامه و باز کردن پنجره «اشتراک‌گذاری» سیستم
 *   (تلگرام، Google Drive، ایمیل، مدیر فایل و ...) + ذخیره یک نسخه در پوشه Documents/Apartemant (اندروید ۱۱ به بالا)
 * - مرورگر: دانلود مستقیم فایل
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface ExportResult {
  /** پنجره اشتراک‌گذاری باز شد و کاربر مقصدی را انتخاب کرد (یا دانلود در مرورگر انجام شد) */
  shared: boolean;
  /** مسیر نمایشی نسخه ذخیره‌شده در حافظه گوشی (در صورت موفقیت) */
  savedPath: string | null;
}

const DOCS_FOLDER = 'Apartemant';

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('cancel');
}

async function saveToDocuments(fileName: string, json: string): Promise<string | null> {
  const attempt = async (name: string) => {
    await Filesystem.writeFile({ path: `${DOCS_FOLDER}/${name}`, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return `Documents/${DOCS_FOLDER}/${name}`;
  };
  try {
    return await attempt(fileName);
  } catch {
    // مثلاً فایلی با همین نام از نصب قبلی برنامه وجود دارد یا اندروید ۱۰ و قدیمی‌تر (نیاز به مجوز حافظه)
    try {
      const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
      return await attempt(fileName.replace(/\.json$/, `-${stamp}.json`));
    } catch {
      return null;
    }
  }
}

export async function exportBackupFile(fileName: string, json: string): Promise<ExportResult> {
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { shared: true, savedPath: null };
  }

  const savedPath = await saveToDocuments(fileName, json);
  const { uri } = await Filesystem.writeFile({ path: fileName, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({
      title: 'نسخه پشتیبان آپارتمانت',
      text: 'فایل پشتیبان اطلاعات برنامه «آپارتمانت» (محاسبه شارژ ساختمان)',
      files: [uri],
      dialogTitle: 'ارسال یا ذخیره فایل پشتیبان',
    });
    return { shared: true, savedPath };
  } catch (e) {
    if (isCancel(e)) return { shared: false, savedPath };
    if (savedPath) return { shared: false, savedPath };
    throw e;
  }
}

/** خواندن متن فایل انتخاب‌شده توسط کاربر (input type=file) */
export function readPickedFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

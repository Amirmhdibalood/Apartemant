/**
 * خروجی گرفتن از فایل پشتیبان روی پلتفرم‌های مختلف (کاملاً آفلاین):
 * - اندروید: نوشتن فایل در Cache برنامه (با تأیید وجود و اندازه) و باز کردن پنجره «اشتراک‌گذاری» سیستم
 *   (تلگرام، Google Drive، ایمیل، مدیر فایل و ...) + ذخیره یک نسخه در پوشه Documents/Apartemant (اندروید ۱۱ به بالا)
 * - مرورگر: دانلود مستقیم فایل
 * موفقیت فقط وقتی گزارش می‌شود که واقعاً مقصدی انتخاب شده باشد؛ منطق در logic/backupExport.ts (قابل تست).
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { performBackupExport, type ExportResult } from '../logic/backupExport';

export type { ExportResult };

const DOCS_FOLDER = 'Apartemant';

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** نوشتن و سپس تأیید وجود فایل با اندازهٔ درست (stat) */
async function writeVerified(path: string, json: string, directory: Directory): Promise<string> {
  const { uri } = await Filesystem.writeFile({ path, data: json, directory, encoding: Encoding.UTF8, recursive: true });
  const st = await Filesystem.stat({ path, directory });
  if (!st || st.size !== byteLength(json)) throw new Error('فایل ذخیره نشد');
  return uri;
}

async function saveToDocuments(fileName: string, json: string): Promise<string | null> {
  const attempt = async (name: string) => {
    await writeVerified(`${DOCS_FOLDER}/${name}`, json, Directory.Documents);
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

export function exportBackupFile(fileName: string, json: string): Promise<ExportResult> {
  return performBackupExport(
    {
      isNative: Capacitor.isNativePlatform(),
      download: (name, data) => {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      saveCopy: saveToDocuments,
      writeTemp: (name, data) => writeVerified(name, data, Directory.Cache),
      share: (uri) => Share.share({
        title: 'نسخه پشتیبان آپارتمانت',
        text: 'فایل پشتیبان اطلاعات برنامه «آپارتمانت» (محاسبه شارژ ساختمان)',
        files: [uri],
        dialogTitle: 'ارسال یا ذخیره فایل پشتیبان',
      }),
    },
    fileName,
    json,
  );
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

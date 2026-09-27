/**
 * اشتراک‌گذاری / ذخیره «تصویر قبض» — کاملاً آفلاین و بدون مجوز خطرناک:
 * - اشتراک‌گذاری: فایل PNG در Cache برنامه نوشته و با پنجره Share اندروید ارسال می‌شود (@capacitor/share).
 * - ذخیره در گالری (اندروید ۱۰+): افزونه بومی GallerySaver از طریق MediaStore در Pictures/Apartemant
 *   (بدون هیچ مجوز حافظه؛ فایل بلافاصله در گالری دیده می‌شود).
 *   اندروید ۹ و قدیمی‌تر (بدون مجوز امکان‌پذیر نیست): پنجره اشتراک‌گذاری باز می‌شود تا کاربر «ذخیره» را انتخاب کند.
 * - مرورگر: دانلود فایل PNG.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { BillWithUnits } from '../models/types';
import { renderBillImage, type RenderedBillImage } from './billImage';

export const GALLERY_ALBUM = 'Apartemant';

interface GallerySaverPlugin {
  saveImage(options: { data: string; fileName: string; album: string }): Promise<{ uri: string; path: string }>;
}
const GallerySaver = registerPlugin<GallerySaverPlugin>('GallerySaver');

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('cancel') || msg.includes('abort');
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function dataUrlToFile(img: RenderedBillImage): Promise<File> {
  const blob = await (await fetch(img.dataUrl)).blob();
  return new File([blob], img.fileName, { type: 'image/png' });
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

/** باز کردن پنجره اشتراک‌گذاری با تصویر (تلگرام، واتس‌اپ، ...) */
export async function shareBillImage(data: BillWithUnits, pre?: RenderedBillImage): Promise<ShareOutcome> {
  const img = pre ?? (await renderBillImage(data));
  if (!Capacitor.isNativePlatform()) {
    try {
      const file = await dataUrlToFile(img);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'قبض' });
        return 'shared';
      }
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
    }
    downloadDataUrl(img.dataUrl, img.fileName);
    return 'downloaded';
  }
  const { uri } = await Filesystem.writeFile({ path: img.fileName, data: img.base64, directory: Directory.Cache });
  try {
    await Share.share({ title: 'تصویر قبض', files: [uri], dialogTitle: 'اشتراک‌گذاری تصویر قبض' });
    return 'shared';
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    throw e;
  }
}

export type SaveOutcome =
  | { kind: 'saved'; path: string }
  | { kind: 'downloaded' }
  /** اندروید ۹ و قدیمی‌تر: پنجره اشتراک‌گذاری باز شد */
  | { kind: 'shared-fallback'; outcome: ShareOutcome };

/** ذخیره تصویر در گالری (Pictures/Apartemant) */
export async function saveBillImageToGallery(data: BillWithUnits, pre?: RenderedBillImage): Promise<SaveOutcome> {
  const img = pre ?? (await renderBillImage(data));
  if (!Capacitor.isNativePlatform()) {
    downloadDataUrl(img.dataUrl, img.fileName);
    return { kind: 'downloaded' };
  }
  try {
    const r = await GallerySaver.saveImage({ data: img.base64, fileName: img.fileName, album: GALLERY_ALBUM });
    return { kind: 'saved', path: r.path || `Pictures/${GALLERY_ALBUM}/${img.fileName}` };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const msg = String((e as { message?: string })?.message ?? e);
    if (code === 'UNSUPPORTED' || msg.includes('UNSUPPORTED') || msg.includes('not implemented')) {
      return { kind: 'shared-fallback', outcome: await shareBillImage(data, img) };
    }
    throw e;
  }
}

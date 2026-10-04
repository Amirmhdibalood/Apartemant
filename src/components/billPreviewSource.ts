import type { BillWithUnits } from '../models/types';
import type { RenderedBillImage } from '../services/billImage';
import type { PreviewSource } from './ReportPreview';

/** منبع پیش‌نمایش برای «تصویر قبض» (همان پیش‌نمایش گزارش‌ها؛ PNG، PDF و پرینت). اگر تصویر از قبل ساخته شده باشد دوباره رسم نمی‌شود */
export function billPreviewSource(data: BillWithUnits, pre?: RenderedBillImage | null): PreviewSource {
  return {
    title: 'تصویر قبض',
    subtitle: '',
    shareTitle: 'قبض',
    render: async () => {
      const m = await import('../services/billImage');
      const img = pre ?? (await m.renderBillImage(data));
      const el = await m.loadImage(img.dataUrl);
      if (!el) throw new Error('image-unavailable');
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas-unavailable');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(el, 0, 0, img.width, img.height);
      return { canvas, scale: img.width / 540, breaks: [], stamp: '', fileBase: '', fileStem: img.fileName.replace(/\.png$/, '') };
    },
  };
}

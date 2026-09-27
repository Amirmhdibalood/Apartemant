import { useState } from 'react';
import type { BillWithUnits } from '../models/types';
import { IconImageDown, IconShare } from './Icons';
import { useFeedback } from '../context/FeedbackContext';
import type { RenderedBillImage } from '../services/billImage';

interface Props {
  data: BillWithUnits;
  /** تصویر از قبل ساخته‌شده (مثلاً برای پیش‌نمایش) */
  image?: RenderedBillImage | null;
  compact?: boolean;
}

/** دکمه‌های «اشتراک‌گذاری تصویر» و «ذخیره در گالری» (خروجی PNG قبض، آفلاین) */
export function BillImageActions({ data, image, compact }: Props) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);

  const run = async (kind: 'share' | 'save') => {
    if (busy) return;
    setBusy(kind);
    try {
      // بارگذاری تنبل: کد رسم تصویر فقط هنگام نیاز
      const svc = await import('../services/billImageExport');
      if (kind === 'share') {
        const r = await svc.shareBillImage(data, image ?? undefined);
        if (r === 'downloaded') toast('تصویر قبض دانلود شد.');
      } else {
        const r = await svc.saveBillImageToGallery(data, image ?? undefined);
        if (r.kind === 'saved') toast(`تصویر در گالری ذخیره شد (${r.path}).`);
        else if (r.kind === 'downloaded') toast('تصویر قبض دانلود شد.');
      }
    } catch {
      toast(kind === 'share' ? 'اشتراک‌گذاری تصویر انجام نشد.' : 'ذخیره تصویر در گالری انجام نشد.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={'image-actions' + (compact ? ' image-actions--compact' : '')}>
      <button type="button" className="btn btn--primary" onClick={() => void run('share')} disabled={!!busy}>
        <IconShare size={18} />
        <span>{busy === 'share' ? 'در حال آماده‌سازی…' : 'اشتراک‌گذاری تصویر'}</span>
      </button>
      <button type="button" className="btn btn--soft" onClick={() => void run('save')} disabled={!!busy}>
        <IconImageDown size={18} />
        <span>{busy === 'save' ? 'در حال ذخیره…' : 'ذخیره در گالری'}</span>
      </button>
    </div>
  );
}

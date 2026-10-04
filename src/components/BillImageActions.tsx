import { useMemo, useState } from 'react';
import type { BillWithUnits } from '../models/types';
import { IconImageDown, IconShare } from './Icons';
import { ReportPreview } from './ReportPreview';
import { billPreviewSource } from './billPreviewSource';
import type { PreviewAction } from '../logic/reportPreview';
import { useFeedback } from '../context/FeedbackContext';
import type { RenderedBillImage } from '../services/billImage';

interface Props {
  data: BillWithUnits;
  /** تصویر از قبل ساخته‌شده (مثلاً برای پیش‌نمایش) */
  image?: RenderedBillImage | null;
  compact?: boolean;
  /** true (پیش‌فرض از ۱.۷.۴): هر دکمه ابتدا «پیش‌نمایش خروجی» را باز می‌کند؛ false: همان رفتار مستقیم */
  preview?: boolean;
}

/** دکمه‌های «اشتراک‌گذاری تصویر» و «ذخیره در گالری» (خروجی PNG قبض، آفلاین) */
export function BillImageActions({ data, image, compact, preview = true }: Props) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [pv, setPv] = useState<PreviewAction | null>(null);
  const source = useMemo(() => billPreviewSource(data, image), [data, image]);

  const run = async (kind: 'share' | 'save') => {
    if (busy) return;
    if (preview) { setPv(kind); return; }
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
      {pv && <ReportPreview source={source} action={pv} onClose={() => setPv(null)} />}
    </div>
  );
}

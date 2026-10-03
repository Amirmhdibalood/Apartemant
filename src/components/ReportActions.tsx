import { useState } from 'react';
import { IconImageDown, IconPrinter, IconShare } from './Icons';
import { PrintSheet, type PrintFormat } from './PrintSheet';
import { useFeedback } from '../context/FeedbackContext';
import type { ReportDoc } from '../logic/reportDoc';
import type { PdfSize } from '../logic/pdf';

interface Props {
  /** سند گزارش جاری (null = چیزی برای خروجی نیست) */
  doc: ReportDoc | null;
}

/** سه دکمهٔ هر گزارش: ذخیره، اشتراک‌گذاری (همان تصویر قبض) و پرینت (برگهٔ JPEG/PDF) */
export function ReportActions({ doc }: Props) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<'save' | 'share' | 'print' | null>(null);
  const [sheet, setSheet] = useState(false);
  const disabled = !doc || !!busy;

  const run = async (kind: 'save' | 'share', d: ReportDoc) => {
    setBusy(kind);
    try {
      const svc = await import('../services/reportExport');
      if (kind === 'share') {
        const r = await svc.shareReportImage(d);
        if (r === 'downloaded') toast('تصویر گزارش دانلود شد.');
      } else {
        const r = await svc.saveReportImage(d);
        if (r.kind === 'saved') toast(`تصویر گزارش در گالری ذخیره شد (${r.path}).`);
        else if (r.kind === 'downloaded') toast('تصویر گزارش دانلود شد.');
      }
    } catch {
      toast(kind === 'share' ? 'اشتراک‌گذاری تصویر گزارش انجام نشد.' : 'ذخیره تصویر گزارش در گالری انجام نشد.');
    } finally { setBusy(null); }
  };

  const print = async (format: PrintFormat, size: PdfSize) => {
    if (!doc) return;
    setBusy('print');
    try {
      const svc = await import('../services/reportExport');
      if (format === 'jpeg') {
        const r = await svc.printReportJpeg(doc);
        if (r === 'downloaded') toast('تصویر JPEG گزارش دانلود شد.');
      } else {
        const r = await svc.printReportPdf(doc, size);
        if (r === 'downloaded') toast('فایل PDF گزارش دانلود شد.');
        else if (r === 'shared') toast('چاپ مستقیم ممکن نبود؛ PDF برای ارسال/چاپ باز شد.');
      }
      setSheet(false);
    } catch {
      toast('ساخت خروجی پرینت انجام نشد.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <div className="report-actions" aria-label="خروجی گزارش">
        <button type="button" className="btn btn--soft" disabled={disabled} onClick={() => doc && void run('save', doc)}>
          <IconImageDown size={18} /><span>{busy === 'save' ? 'در حال ذخیره…' : 'ذخیره'}</span>
        </button>
        <button type="button" className="btn btn--soft" disabled={disabled} onClick={() => doc && void run('share', doc)}>
          <IconShare size={18} /><span>{busy === 'share' ? 'در حال آماده‌سازی…' : 'اشتراک‌گذاری'}</span>
        </button>
        <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => setSheet(true)}>
          <IconPrinter size={18} /><span>پرینت</span>
        </button>
      </div>
      <PrintSheet open={sheet} title={doc ? `${doc.title} — ${doc.subtitle}` : ''} busy={busy === 'print'} onClose={() => !busy && setSheet(false)} onConfirm={(f, s) => void print(f, s)} />
    </>
  );
}

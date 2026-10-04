import { useMemo, useState } from 'react';
import { IconImageDown, IconPrinter, IconShare } from './Icons';
import { ReportPreview, type PreviewSource } from './ReportPreview';
import type { ReportDoc } from '../logic/reportDoc';
import type { PreviewAction } from '../logic/reportPreview';

interface Props {
  /** سند گزارش جاری (null = چیزی برای خروجی نیست) */
  doc: ReportDoc | null;
}

/** سه دکمهٔ هر گزارش: ذخیره، اشتراک‌گذاری و پرینت — هر سه (از ۱.۷.۴) ابتدا «پیش‌نمایش خروجی» را باز می‌کنند؛ تأیید نهایی از داخل پیش‌نمایش است */
export function ReportActions({ doc }: Props) {
  const [action, setAction] = useState<PreviewAction | null>(null);
  const source = useMemo<PreviewSource | null>(() => (doc ? {
    title: doc.title,
    subtitle: doc.subtitle,
    render: async () => (await import('../services/reportImage')).renderReportCanvas(doc),
  } : null), [doc]);
  const disabled = !doc;

  return (
    <>
      <div className="report-actions" aria-label="خروجی گزارش">
        <button type="button" className="btn btn--soft" disabled={disabled} onClick={() => setAction('save')}>
          <IconImageDown size={18} /><span>ذخیره</span>
        </button>
        <button type="button" className="btn btn--soft" disabled={disabled} onClick={() => setAction('share')}>
          <IconShare size={18} /><span>اشتراک‌گذاری</span>
        </button>
        <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => setAction('print')}>
          <IconPrinter size={18} /><span>پرینت</span>
        </button>
      </div>
      {action && <ReportPreview source={source} action={action} onClose={() => setAction(null)} />}
    </>
  );
}

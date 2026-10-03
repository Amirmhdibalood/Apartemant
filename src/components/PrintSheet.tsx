import { useEffect, useState } from 'react';
import { IconPrinter, IconFile, IconImage } from './Icons';
import { DEFAULT_PDF_SIZE, PDF_SIZE_LABEL, type PdfSize } from '../logic/pdf';

export type PrintFormat = 'jpeg' | 'pdf';

interface Props {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (format: PrintFormat, size: PdfSize) => void;
}

const SIZES: { id: PdfSize; sub: string; w: number; h: number }[] = [
  { id: 'a4', sub: '۲۱ × ۲۹٫۷ سانتی‌متر', w: 30, h: 42 },
  { id: 'a5', sub: '۱۴٫۸ × ۲۱ سانتی‌متر', w: 24, h: 34 },
  { id: 'std', sub: 'پیش‌فرض؛ هم‌عرض تصویر فعلی', w: 26, h: 38 },
];

/** برگهٔ پایین «پرینت گزارش»: قالب (JPEG/PDF) و برای PDF اندازهٔ صفحه (A4/A5/اندازه عادی [پیش‌فرض]) */
export function PrintSheet({ open, title, busy, onClose, onConfirm }: Props) {
  const [format, setFormat] = useState<PrintFormat>('pdf');
  const [size, setSize] = useState<PdfSize>(DEFAULT_PDF_SIZE);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="print-ov dialog-backdrop" onClick={onClose}>
      <div className="print-sheet" role="dialog" aria-modal="true" aria-label="پرینت گزارش" onClick={(e) => e.stopPropagation()}>
        <div className="print-sheet__handle" />
        <h2 className="print-sheet__title"><IconPrinter size={22} /> پرینت گزارش</h2>
        <p className="print-sheet__sub">{title}</p>
        <div className="print-sheet__lab">قالب خروجی</div>
        <div role="radiogroup" aria-label="قالب خروجی">
          <button type="button" role="radio" aria-checked={format === 'jpeg'} className={'print-opt' + (format === 'jpeg' ? ' is-on' : '')} onClick={() => setFormat('jpeg')}>
            <span className="print-opt__rd" />
            <span className="print-opt__t"><b>تصویر JPEG</b><small>همان اندازهٔ تصویر فعلی گزارش</small></span>
            <span className="print-opt__gl"><IconImage size={24} /></span>
          </button>
          <button type="button" role="radio" aria-checked={format === 'pdf'} className={'print-opt' + (format === 'pdf' ? ' is-on' : '')} onClick={() => setFormat('pdf')}>
            <span className="print-opt__rd" />
            <span className="print-opt__t"><b>فایل PDF</b><small>مناسب چاپ روی کاغذ یا ارسال</small></span>
            <span className="print-opt__gl"><IconFile size={24} /></span>
          </button>
        </div>
        {format === 'pdf' ? (
          <>
            <div className="print-sheet__lab">اندازهٔ صفحهٔ PDF</div>
            <div className="print-sizes" role="radiogroup" aria-label="اندازهٔ صفحهٔ PDF">
              {SIZES.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={size === s.id} className={'print-size' + (size === s.id ? ' is-on' : '')} onClick={() => setSize(s.id)}>
                  <span className="print-size__pg" style={{ width: s.w, height: s.h }} />
                  <b>{PDF_SIZE_LABEL[s.id]}</b>
                  <small>{s.sub}</small>
                </button>
              ))}
            </div>
            <p className="print-sheet__hint">اگر اندازه‌ای انتخاب نکنید، «اندازه عادی» (همان عرض تصویر فعلی) استفاده می‌شود. گزارش‌های بلند در A4/A5 چندصفحه‌ای می‌شوند.</p>
          </>
        ) : (
          <p className="print-sheet__hint">JPEG با همان اندازه و کیفیت تصویر ذخیره/اشتراک فعلی ساخته و در پنجرهٔ اشتراک‌گذاری برای چاپ یا ارسال باز می‌شود.</p>
        )}
        <div className="print-sheet__btns">
          <button type="button" className="btn btn--muted" onClick={onClose}>انصراف</button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onConfirm(format, size)}>
            <IconPrinter size={18} />
            <span>{busy ? 'در حال آماده‌سازی…' : format === 'pdf' ? 'ساخت PDF و پرینت' : 'ساخت JPEG و ارسال'}</span>
          </button>
        </div>
        <p className="print-sheet__hint print-sheet__hint--c">«ذخیره» و «اشتراک‌گذاری» بدون تغییر همان خروجی تصویری فعلی را می‌دهند.</p>
      </div>
    </div>
  );
}

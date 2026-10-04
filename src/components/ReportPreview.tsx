import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronLeft, IconImageDown, IconPrinter, IconShare } from './Icons';
import { useFeedback } from '../context/FeedbackContext';
import { toPersianDigits } from '../logic/formatting';
import { DEFAULT_PDF_SIZE, PDF_PAGE_PT, PDF_SIZE_LABEL, type PdfSize } from '../logic/pdf';
import { initialTab, loadPdfSize, pageLabel, previewPages, savePdfSize, sliceBox, type PreviewAction, type PreviewTab } from '../logic/reportPreview';
import type { RenderedReportImage, ReportCanvas } from '../services/reportImage';

const fa = toPersianDigits;

/** منبع پیش‌نمایش: هر چیزی که بتواند یک‌بار «canvas خروجی» بسازد (گزارش‌ها و تصویر قبض) */
export interface PreviewSource {
  title: string;
  subtitle: string;
  /** عنوان برای پنجرهٔ اشتراک‌گذاری/چاپ */
  shareTitle?: string;
  render: () => Promise<ReportCanvas>;
}

interface Props {
  source: PreviewSource | null;
  /** دکمه‌ای که کاربر زده (برجسته می‌شود و تب اولیه را تعیین می‌کند) */
  action: PreviewAction;
  onClose: () => void;
}

/** کاغذ همیشه سفید است (رنگ چاپ)، حتی در تم تیره — درون‌خطی تا تولیدکنندهٔ تم تاریک/روشن دستش نزند */
const PAPER = { background: '#FFFFFF' } as const;
const SIZES: PdfSize[] = ['a4', 'a5', 'std'];
const PG_W = 480; // عرض پیکسلی تصویر هر صفحهٔ پیش‌نمایش
const PAGE_BOX: Record<'a4' | 'a5', { w: number; h: number }> = { a4: { w: 18, h: 25 }, a5: { w: 14, h: 19 } };

/** تصویر هر صفحهٔ PDF دقیقاً با همان برش و حاشیه‌ای که در فایل نهایی می‌آید */
function pageImages(rc: ReportCanvas, size: 'a4' | 'a5'): string[] {
  const pages = previewPages(rc.canvas.width, rc.canvas.height, rc.breaks, size);
  const pg = PDF_PAGE_PT[size];
  const W = PG_W, H = Math.round(W * (pg.h / pg.w));
  return pages.map(({ y0, y1 }) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    const h = Math.round(y1 - y0);
    const b = sliceBox(size, rc.canvas.width, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rc.canvas, 0, Math.round(y0), rc.canvas.width, h, b.x * W, b.y * W, b.w * W, b.h * W);
    return c.toDataURL('image/jpeg', 0.85);
  });
}

/**
 * «پیش‌نمایش خروجی» تمام‌صفحه (از ۱.۷.۴) برای ذخیره / اشتراک‌گذاری / پرینت — همهٔ گزارش‌ها و تصویر قبض:
 * تصویر یک‌بار ساخته می‌شود (همیشه با رنگ چاپ روشن)، تب «تصویر (PNG)» یا «PDF» (A4/A5/عادی، صفحه‌به‌صفحه)،
 * و تأیید نهایی با دکمه‌های ذخیره/اشتراک‌گذاری/پرینت. «بازگشت» بدون هیچ خروجی می‌بندد.
 */
export function ReportPreview({ source, action, onClose }: Props) {
  const { toast } = useFeedback();
  const [built, setBuilt] = useState<{ rc: ReportCanvas; png: RenderedReportImage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>(initialTab(action));
  const [size, setSize] = useState<PdfSize>(() => loadPdfSize());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<PreviewAction | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const pdfCache = useRef<{ key: string; v: { bytes: Uint8Array; fileName: string } } | null>(null);
  const touch = useRef<number | null>(null);

  useEffect(() => { setTab(initialTab(action)); setPage(0); }, [source, action]);

  // ساخت تصویر: فقط یک‌بار برای هر منبع
  useEffect(() => {
    setBuilt(null); setError(null); pdfCache.current = null;
    if (!source) return;
    let alive = true;
    (async () => {
      try {
        const rc = await source.render();
        const png = (await import('../services/reportImage')).encodeReportImage(rc, 'png');
        if (alive) setBuilt({ rc, png });
      } catch (e) {
        if (alive) setError(String((e as Error)?.message).includes('too-tall') ? 'این گزارش برای پیش‌نمایش بیش از حد بلند است؛ بازهٔ آن را کوتاه‌تر کنید.' : 'ساخت پیش‌نمایش انجام نشد.');
      }
    })();
    return () => { alive = false; };
  }, [source]);

  const close = useCallback(() => { if (!busyRef.current) onClose(); }, [onClose]);
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [source, close]);

  const paged = tab === 'pdf' && size !== 'std';
  const pages = useMemo(() => (built && paged ? pageImages(built.rc, size as 'a4' | 'a5') : []), [built, paged, size]);
  const pageCount = paged ? pages.length : 1;
  const cur = Math.min(page, Math.max(0, pageCount - 1));

  if (!source) return null;

  const title = source.shareTitle ?? (source.subtitle ? `${source.title} — ${source.subtitle}` : source.title);

  const pdfOf = async () => {
    const key = size;
    if (pdfCache.current?.key === key) return pdfCache.current.v;
    await new Promise((r) => setTimeout(r, 30)); // فرصت نمایش «در حال آماده‌سازی…»
    const svc = await import('../services/reportExport');
    const v = svc.createReportPdf(built!.rc, size);
    pdfCache.current = { key, v };
    return v;
  };

  const run = async (kind: PreviewAction) => {
    if (!built || busy) return;
    setBusy(kind);
    try {
      const svc = await import('../services/reportExport');
      if (tab === 'image') {
        if (kind === 'share') {
          if ((await svc.shareReportPng(built.png, title)) === 'downloaded') toast('تصویر دانلود شد.');
        } else if (kind === 'save') {
          const r = await svc.saveReportPng(built.png, title);
          if (r.kind === 'saved') toast(`تصویر در گالری ذخیره شد (${r.path}).`);
          else if (r.kind === 'downloaded') toast('تصویر دانلود شد.');
        } else if ((await svc.printReportJpeg(built.rc, title)) === 'downloaded') toast('تصویر JPEG دانلود شد.');
      } else {
        const pdf = await pdfOf();
        if (kind === 'print') {
          const r = await svc.printPdfBytes(pdf.bytes, pdf.fileName, title);
          if (r === 'downloaded') toast('فایل PDF دانلود شد.');
          else if (r === 'shared') toast('چاپ مستقیم ممکن نبود؛ PDF برای ارسال/چاپ باز شد.');
        } else {
          const r = await svc.sharePdfFile(pdf.bytes, pdf.fileName, `گزارش ${title}`, kind === 'save' ? `ذخیرهٔ PDF ${title}` : `اشتراک‌گذاری PDF ${title}`);
          if (r === 'downloaded') toast('فایل PDF دانلود شد.');
        }
      }
    } catch {
      toast(kind === 'print' ? 'ساخت خروجی پرینت انجام نشد.' : kind === 'share' ? 'اشتراک‌گذاری انجام نشد.' : 'ذخیره انجام نشد.');
    } finally { setBusy(null); }
  };

  const pickSize = (s: PdfSize) => { setSize(s); setPage(0); savePdfSize(s); };
  const go = (d: number) => setPage(Math.max(0, Math.min(pageCount - 1, cur + d)));
  const onTouchEnd = (x: number) => {
    if (touch.current === null || !paged) return;
    const dx = x - touch.current; touch.current = null;
    // صفحه راست‌به‌چپ است: صفحهٔ بعد سمت چپ است، پس کشیدن به راست = صفحهٔ بعد
    if (Math.abs(dx) > 50) go(dx > 0 ? 1 : -1);
  };

  const dim = built ? `${fa(built.png.width)} × ${fa(built.png.height)} پیکسل` : '';
  const meta = !built ? '' : tab === 'image' ? `تصویر ${dim}` : size === 'std' ? `PDF · یک صفحهٔ بلند هم‌عرض تصویر` : `${fa(pageCount)} صفحهٔ ${PDF_SIZE_LABEL[size]} · برش در مرز ردیف‌ها`;
  const lab = (k: PreviewAction, idle: string, doing: string) => (busy === k ? doing : idle);
  const hi = (k: PreviewAction) => (action === k ? 'btn btn--primary' : 'btn btn--soft');

  const node = (
    <div className="pv" role="dialog" aria-modal="true" aria-label="پیش‌نمایش خروجی">
      <div className="pv-top">
        <button type="button" className="icon-btn pv-back" onClick={close} aria-label="بازگشت (بدون خروجی)"><IconChevronLeft size={24} /></button>
        <div className="pv-ttl"><b>پیش‌نمایش خروجی</b><small>{source.subtitle ? `${source.title} — ${source.subtitle}` : source.title}</small></div>
        <span className="pv-badge" title="پیش‌نمایش همیشه با رنگ‌های چاپ (روشن) ساخته می‌شود">رنگ چاپ</span>
      </div>

      <div className="pv-ctl">
        <div className="pv-seg" role="tablist" aria-label="قالب خروجی">
          <button type="button" role="tab" aria-selected={tab === 'image'} className={tab === 'image' ? 'is-on' : ''} onClick={() => { setTab('image'); setPage(0); }}>تصویر (PNG)</button>
          <button type="button" role="tab" aria-selected={tab === 'pdf'} className={tab === 'pdf' ? 'is-on' : ''} onClick={() => { setTab('pdf'); setPage(0); }}>فایل PDF</button>
        </div>
        {tab === 'pdf' && (
          <div className="pv-sizes" role="radiogroup" aria-label="اندازهٔ صفحهٔ PDF">
            {SIZES.map((s) => {
              const bx = s === 'std' ? { w: 12, h: 26 } : PAGE_BOX[s];
              return (
                <button key={s} type="button" role="radio" aria-checked={size === s} className={'print-size' + (size === s ? ' is-on' : '')} onClick={() => pickSize(s)}>
                  <span className="print-size__pg" style={{ width: bx.w, height: bx.h }} />
                  <b>{PDF_SIZE_LABEL[s]}</b>
                </button>
              );
            })}
          </div>
        )}
        <div className="pv-meta"><span>{meta}</span><span>{tab === 'pdf' && size === DEFAULT_PDF_SIZE ? 'اندازهٔ پیش‌فرض' : 'همان خروجی نهایی'}</span></div>
      </div>

      <div className="pv-stage" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => onTouchEnd(e.changedTouches[0].clientX)}>
        {error && <div className="pv-state pv-state--err" role="alert">{error}</div>}
        {!error && !built && <div className="pv-state" role="status">در حال ساخت پیش‌نمایش…</div>}
        {built && !paged && (
          <div className="pv-scroll" data-pv-scroll>
            <div className="pv-paper" style={PAPER}><img src={built.png.dataUrl} alt="پیش‌نمایش خروجی" /></div>
          </div>
        )}
        {built && paged && (
          <div className="pv-pagewrap">
            <div className="pv-page" style={{ ...PAPER, aspectRatio: `${PDF_PAGE_PT[size as 'a4' | 'a5'].w} / ${PDF_PAGE_PT[size as 'a4' | 'a5'].h}` }}>
              <img src={pages[cur]} alt={pageLabel(cur + 1, pageCount)} />
            </div>
            {pageCount > 1 && (
              <>
                <button type="button" className="pv-nav pv-nav--next" onClick={() => go(1)} disabled={cur >= pageCount - 1} aria-label="صفحهٔ بعد"><IconChevronLeft size={22} /></button>
                <button type="button" className="pv-nav pv-nav--prev" onClick={() => go(-1)} disabled={cur <= 0} aria-label="صفحهٔ قبل"><IconChevronLeft size={22} /></button>
              </>
            )}
            <div className="pv-pgn" aria-live="polite">{pageLabel(cur + 1, pageCount)}</div>
          </div>
        )}
      </div>

      {paged && pageCount > 1 && (
        <div className="pv-thumbs" aria-label="صفحه‌ها">
          {pages.map((src, i) => (
            <button key={i} type="button" style={PAPER} className={'pv-th' + (i === cur ? ' is-on' : '')} onClick={() => setPage(i)} aria-label={pageLabel(i + 1, pageCount)} aria-current={i === cur}>
              <img src={src} alt="" /><i>{fa(i + 1)}</i>
            </button>
          ))}
        </div>
      )}

      <div className="pv-bar">
        <div className="pv-acts">
          <button type="button" className={hi('save')} disabled={!built || !!busy} onClick={() => void run('save')}>
            <IconImageDown size={18} /><span>{lab('save', 'ذخیره', 'در حال ذخیره…')}</span>
          </button>
          <button type="button" className={hi('share')} disabled={!built || !!busy} onClick={() => void run('share')}>
            <IconShare size={18} /><span>{lab('share', 'اشتراک‌گذاری', 'در حال آماده‌سازی…')}</span>
          </button>
          <button type="button" className={hi('print')} disabled={!built || !!busy} onClick={() => void run('print')}>
            <IconPrinter size={18} /><span>{lab('print', 'پرینت', 'در حال آماده‌سازی…')}</span>
          </button>
        </div>
        <p className="pv-hint">
          {tab === 'image'
            ? 'ذخیره: گالری (Pictures/Apartemant) • اشتراک‌گذاری: PNG • پرینت: JPEG از پنجرهٔ اشتراک‌گذاری'
            : 'ذخیره و اشتراک‌گذاری PDF از پنجرهٔ اشتراک‌گذاری انجام می‌شود • پرینت مستقیم به چاپگر'}
        </p>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

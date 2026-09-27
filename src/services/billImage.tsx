/**
 * رسم «تصویر قبض» (PNG، فارسی راست‌به‌چپ) روی canvas — کاملاً آفلاین.
 * فونت Vazirmatn از فایل‌های محلی (@fontsource) بارگذاری می‌شود و شکل‌دهی/اتصال حروف فارسی
 * توسط موتور متن مرورگر (HarfBuzz در WebView اندروید) انجام می‌شود.
 */
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { BillWithUnits } from '../models/types';
import { buildBillImageModel, type BillImageModel, type UnitStatusKind } from '../logic/billImage';
import { ExpenseGlyph } from '../components/ExpenseIcon';
import appIconUrl from '../assets/app-icon.png';

/** عرض منطقی تصویر (خروجی نهایی ۲ برابر: ۱۰۸۰ پیکسل) */
const W = 540;
const SCALE = 2;
const FONT = 'Vazirmatn, Tahoma, sans-serif';
const C = {
  bg: '#EEF3FC',
  card: '#FFFFFF',
  text: '#1C2440',
  text2: '#3D4660',
  muted: '#7A8398',
  border: '#E4E9F2',
  headRow: '#F2F5FA',
  zebra: '#FAFBFE',
  primary: '#2F74F0',
  primarySoft: '#EAF1FE',
  purple: '#7C3AED',
  purpleSoft: '#F3E8FF',
};
const STATUS_STYLE: Record<UnitStatusKind, { fg: string; bg: string }> = {
  settled: { fg: '#1F9557', bg: '#E8F7EF' },
  partial: { fg: '#B7791F', bg: '#FFF6E0' },
  unpaid: { fg: '#D64533', bg: '#FDECEC' },
};

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

/** اطمینان از بارگذاری فونت‌های محلی قبل از رسم (بدون اینترنت) */
async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'آپارتمانت قبض ۰۱۲۳۴۵۶۷۸۹ 0123';
  await Promise.all(
    [400, 500, 700, 800].map((w) => document.fonts.load(font(w, 20), sample).catch(() => [])),
  );
  await document.fonts.ready.catch(() => undefined);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** آیکون نوع هزینه (همان SVG داخل برنامه) به‌صورت تصویر */
async function glyphImage(model: BillImageModel, type: BillWithUnits['bill']['expenseType']): Promise<HTMLImageElement | null> {
  try {
    const host = document.createElement('div');
    const root = createRoot(host);
    flushSync(() => root.render(<ExpenseGlyph type={type} size={64} />));
    let svg = host.innerHTML;
    root.unmount();
    if (!svg.startsWith('<svg')) return null;
    svg = svg.replace(/currentColor/g, model.typeColor);
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    // رنگ آیکون از style="color:..." می‌آید؛ در تصویر مستقل باید صریح باشد
    svg = svg.replace('<svg', `<svg color="${model.typeColor}"`);
    return await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1] + ' …';
    return kept;
  }
  return lines;
}

interface Assets { icon: HTMLImageElement | null; glyph: HTMLImageElement | null }

/**
 * چیدمان و رسم. با draw=false فقط ارتفاع لازم محاسبه می‌شود.
 * همه مختصات منطقی (عرض ۵۴۰) هستند.
 */
function paint(ctx: CanvasRenderingContext2D, m: BillImageModel, a: Assets, draw: boolean, height = 0): number {
  const M = 16; // حاشیه بیرونی
  const P = 22; // فاصله داخلی کارت
  const cardX = M, cardW = W - 2 * M;
  const R = cardX + cardW - P; // لبه راست محتوا
  const L = cardX + P; // لبه چپ محتوا
  const CW = R - L;
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';

  const text = (s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'right') => {
    if (!draw) return;
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  const width = (s: string, f: string) => { ctx.font = f; return ctx.measureText(s).width; };

  if (draw) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, height);
    ctx.save();
    ctx.shadowColor = 'rgba(33, 56, 102, 0.10)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, cardX, M, cardW, height - 2 * M, 22);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.restore();
    // نوار رنگی بالای کارت به رنگ نوع هزینه
    ctx.save();
    roundRect(ctx, cardX, M, cardW, height - 2 * M, 22);
    ctx.clip();
    ctx.fillStyle = m.typeColor;
    ctx.fillRect(cardX, M, cardW, 6);
    ctx.restore();
  }

  let y = M + 6 + 20;

  // --- سربرگ: لوگو و نام برنامه (راست)، تاریخ (چپ)
  const iconS = 26;
  if (draw && a.icon) {
    ctx.save();
    roundRect(ctx, R - iconS, y, iconS, iconS, 7);
    ctx.clip();
    ctx.drawImage(a.icon, R - iconS, y, iconS, iconS);
    ctx.restore();
  }
  text(m.appName, R - iconS - 8, y + iconS / 2 + 1, font(700, 14), C.text2);
  text(m.dateLine, L, y + iconS / 2 + 1, font(500, 12.5), C.muted, 'left');
  y += iconS + 14;
  if (draw) { ctx.fillStyle = C.border; ctx.fillRect(L, y, CW, 1); }
  y += 18;

  // --- نوع هزینه + دوره + نحوه تقسیم
  const circle = 58;
  if (draw) {
    ctx.fillStyle = m.typeIconBg;
    ctx.beginPath();
    ctx.arc(R - circle / 2, y + circle / 2, circle / 2, 0, Math.PI * 2);
    ctx.fill();
    if (a.glyph) ctx.drawImage(a.glyph, R - circle / 2 - 16, y + circle / 2 - 16, 32, 32);
  }
  const tx = R - circle - 14;
  text(m.typeLabel, tx, y + 18, font(800, 23), C.text);
  text(m.period, tx, y + 44, font(500, 15), C.muted);
  // نشان نحوه تقسیم (چپ)
  const badgeF = font(700, 12.5);
  const bw = width(m.splitLabel, badgeF) + 22;
  if (draw) {
    const perUnit = m.splitMethod === 'perUnit';
    roundRect(ctx, L, y + 17, bw, 26, 13);
    ctx.fillStyle = perUnit ? C.purpleSoft : C.primarySoft;
    ctx.fill();
    text(m.splitLabel, L + bw / 2, y + 30.5, badgeF, perUnit ? C.purple : C.primary, 'center');
  }
  y += circle + 18;

  // --- مبلغ کل
  const boxH = m.perShareLine ? 92 : 70;
  if (draw) {
    roundRect(ctx, L, y, CW, boxH, 16);
    ctx.fillStyle = m.typeBg;
    ctx.fill();
  }
  text('مبلغ کل قبض', R - 16, y + 35, font(700, 15), C.text2);
  const curF = font(500, 14);
  const cw = width(m.currency, curF);
  text(m.currency, L + 16, y + 37, curF, C.muted, 'left');
  text(m.total, L + 16 + cw + 8, y + 35, font(800, 27), C.text, 'left');
  if (m.perShareLine) {
    text(m.perShareLine, R - 16, y + 69, font(500, 12.5), C.muted);
    const cnt = m.showOccupants ? `${m.unitCount} واحد • ${m.totalPersons} نفر` : `${m.unitCount} واحد`;
    text(cnt, L + 16, y + 69, font(500, 12.5), C.muted, 'left');
  }
  y += boxH + 14;

  // --- شماره قبض / توضیحات
  const infoF = font(500, 13.5);
  if (m.billNumber) {
    text(`شماره قبض: ${m.billNumber}`, R, y + 10, infoF, C.text2);
    y += 26;
  }
  if (m.description) {
    ctx.font = infoF;
    const lines = wrapLines(ctx, `توضیحات: ${m.description}`, CW);
    for (const ln of lines) { text(ln, R, y + 10, infoF, C.text2); y += 24; }
    y += 2;
  }
  if (m.billNumber || m.description) y += 6;

  // --- جدول واحدها
  type Col = { key: 'unit' | 'occupants' | 'share' | 'status'; title: string; w: number };
  const cols: Col[] = [{ key: 'unit', title: 'واحد', w: 1 }];
  if (m.showOccupants) cols.push({ key: 'occupants', title: 'نفرات', w: 1 });
  cols.push({ key: 'share', title: 'سهم (تومان)', w: 2 });
  if (m.showStatus) cols.push({ key: 'status', title: 'وضعیت', w: 2 });
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const colX: { x0: number; x1: number }[] = [];
  let cx = R;
  for (const c of cols) {
    const w = (CW * c.w) / totalW;
    colX.push({ x0: cx - w, x1: cx });
    cx -= w;
  }
  const headH = 40, rowH = 42;
  if (draw) {
    roundRect(ctx, L, y, CW, headH, 12);
    ctx.fillStyle = C.headRow;
    ctx.fill();
  }
  cols.forEach((c, i) => {
    const mid = (colX[i].x0 + colX[i].x1) / 2;
    text(c.title, mid, y + headH / 2 + 1, font(700, 13.5), C.text2, 'center');
  });
  y += headH;
  m.rows.forEach((r, ri) => {
    if (draw && ri % 2 === 1) { ctx.fillStyle = C.zebra; ctx.fillRect(L, y, CW, rowH); }
    if (draw && ri > 0) { ctx.fillStyle = C.border; ctx.fillRect(L + 6, y, CW - 12, 1); }
    cols.forEach((c, i) => {
      const mid = (colX[i].x0 + colX[i].x1) / 2;
      const cy = y + rowH / 2 + 1;
      if (c.key === 'unit') text(r.unit, mid, cy, font(700, 15), C.text, 'center');
      else if (c.key === 'occupants') text(r.occupants, mid, cy, font(500, 15), C.text2, 'center');
      else if (c.key === 'share') text(r.share, mid, cy, font(700, 15), C.text, 'center');
      else {
        const st = STATUS_STYLE[r.status.kind];
        const f = font(700, 12);
        const pw = Math.min(width(r.status.text, f) + 18, colX[i].x1 - colX[i].x0 - 6);
        if (draw) {
          roundRect(ctx, mid - pw / 2, cy - 12, pw, 24, 12);
          ctx.fillStyle = st.bg;
          ctx.fill();
        }
        text(r.status.text, mid, cy + 0.5, f, st.fg, 'center');
      }
    });
    y += rowH;
  });
  // ردیف جمع
  if (draw) { ctx.fillStyle = C.border; ctx.fillRect(L, y, CW, 1.5); }
  const sumY = y + rowH / 2 + 2;
  text('جمع', (colX[0].x0 + colX[0].x1) / 2, sumY, font(800, 14), C.text, 'center');
  if (m.showOccupants) text(m.totalPersons, (colX[1].x0 + colX[1].x1) / 2, sumY, font(700, 14), C.text2, 'center');
  const si = cols.findIndex((c) => c.key === 'share');
  text(m.total, (colX[si].x0 + colX[si].x1) / 2, sumY, font(800, 15), C.text, 'center');
  y += rowH + 8;

  // --- پانویس
  if (m.settledLine) {
    text(`✓ ${m.settledLine}`, W / 2, y + 10, font(700, 13.5), STATUS_STYLE.settled.fg, 'center');
    y += 28;
  }
  if (draw) { ctx.fillStyle = C.border; ctx.fillRect(L, y, CW, 1); }
  y += 20;
  text(`محاسبه‌شده با برنامه «${m.appName}» — محاسبه شارژ ساختمان`, W / 2, y, font(500, 11.5), C.muted, 'center');
  y += 18 + P + M - 8;
  return Math.ceil(y);
}

export interface RenderedBillImage {
  /** data:image/png;base64,... */
  dataUrl: string;
  /** فقط بخش base64 */
  base64: string;
  fileName: string;
  width: number;
  height: number;
}

/** ساخت تصویر PNG قبض (عرض ۱۰۸۰ پیکسل) */
export async function renderBillImage(data: BillWithUnits, now: Date = new Date()): Promise<RenderedBillImage> {
  await ensureFonts();
  const model = buildBillImageModel(data, now);
  const [icon, glyph] = await Promise.all([loadImage(appIconUrl), glyphImage(model, data.bill.expenseType)]);
  const assets: Assets = { icon, glyph };

  const canvas = document.createElement('canvas');
  const measureCtx = canvas.getContext('2d');
  if (!measureCtx) throw new Error('canvas-unavailable');
  const h = paint(measureCtx, model, assets, false);
  canvas.width = W * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  paint(ctx, model, assets, true, h);
  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), fileName: model.fileName, width: canvas.width, height: canvas.height };
}

/**
 * رسم «تصویر گزارش» (PNG/JPEG، فارسی راست‌به‌چپ) روی canvas — کاملاً آفلاین، با همان فونت و رنگ‌های تصویر قبض.
 * ورودی: ReportDoc (logic/reportDoc.ts). خروجی همان تصویر است که ذخیره/اشتراک‌گذاری (PNG) و پرینت (JPEG/PDF) از آن می‌سازند.
 */
import type { ExpenseType } from '../models/types';
import { billImageColors } from '../logic/billImageColors';
import { sanitizeLightPalette, DEFAULT_LIGHT_PALETTE, type LightPaletteId } from '../logic/lightPalettes';
import { typeColors } from '../logic/typeColor';
import { barLayout, pieLayout, type ChartColors, type BarLayout, type PieLayout } from '../logic/chartLayout';
import type { DocBlock, DocRow, DocTone, ReportDoc } from '../logic/reportDoc';
import { APP_NAME_FA } from '../logic/billImage';
import { formatJalaliDateTimeFa } from '../logic/date';
import { pickReportScale } from '../logic/reportPreview';
import { CURRENCY } from '../models/constants';
import appIconUrl from '../assets/app-icon.png';
import { ensureFonts, font, glyphImageFor, loadImage, roundRect, wrapLines } from './billImage';

/** عرض منطقی (خروجی نهایی ۲ برابر: ۱۰۸۰ پیکسل) */
export const REPORT_W = 540;
export const REPORT_SCALE = 2;

export type ReportImageFormat = 'png' | 'jpeg';

export interface RenderedReportImage {
  dataUrl: string;
  base64: string;
  fileName: string;
  mime: string;
  /** ابعاد پیکسلی */
  width: number;
  height: number;
  /** ضریب واقعی رسم (۲، یا کمتر برای گزارش بسیار بلند) */
  scale: number;
  /** نقطه‌های مجاز شکست صفحه (پیکسل، از بالا) برای PDF چندصفحه‌ای */
  breaks: number[];
  /** canvas کامل (برای برش صفحه‌های PDF) */
  canvas: HTMLCanvasElement;
}

type Pal = ReturnType<typeof billImageColors>;
interface Env { ctx: CanvasRenderingContext2D; draw: boolean; pal: Pal; lp: LightPaletteId; icons: Map<ExpenseType, HTMLImageElement | null>; app: HTMLImageElement | null; breaks: number[] }

const M = 16, P = 22;
const L = M + P, R = REPORT_W - M - P, CW = R - L;

function tone(pal: Pal, t: DocTone): { fg: string; bg: string } {
  switch (t) {
    case 'ok': return pal.STATUS.settled;
    case 'danger': return pal.STATUS.unpaid;
    case 'warn': return pal.STATUS.partial;
    case 'muted': return { fg: pal.C.muted, bg: pal.C.headRow };
    default: return { fg: pal.C.primary, bg: pal.C.primarySoft };
  }
}

function chartColors(pal: Pal): ChartColors {
  return { text: pal.C.text, muted: pal.C.muted, grid: pal.C.border, card: pal.C.card, up: pal.STATUS.unpaid.fg, down: pal.STATUS.settled.fg, upSoft: pal.STATUS.unpaid.bg, downSoft: pal.STATUS.settled.bg, downText: pal.STATUS.settled.fg };
}

function text(e: Env, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'right') {
  if (!e.draw) return;
  e.ctx.font = f; e.ctx.fillStyle = color; e.ctx.textAlign = align; e.ctx.fillText(s, x, y);
}
const width = (e: Env, s: string, f: string) => { e.ctx.font = f; return e.ctx.measureText(s).width; };

function fit(e: Env, s: string, f: string, max: number): string {
  if (width(e, s, f) <= max) return s;
  let t = s;
  while (t.length > 1 && width(e, t + '…', f) > max) t = t.slice(0, -1);
  return t + '…';
}

function drawHeader(e: Env, doc: ReportDoc, now: Date): number {
  const { ctx, pal } = e;
  let y = M + P - 6;
  if (e.draw && e.app) ctx.drawImage(e.app, R - 40, y, 40, 40);
  text(e, APP_NAME_FA, R - 50, y + 12, font(800, 17), pal.C.primary);
  text(e, 'گزارش ساختمان', R - 50, y + 31, font(500, 12), pal.C.muted);
  text(e, formatJalaliDateTimeFa(now), L, y + 20, font(500, 12), pal.C.muted, 'left');
  y += 58;
  text(e, doc.title, R, y + 8, font(800, 21), pal.C.text);
  y += 28;
  text(e, doc.subtitle, R, y + 6, font(600, 14), pal.C.text2);
  y += 26;
  if (e.draw) { ctx.fillStyle = pal.C.border; ctx.fillRect(L, y, CW, 1); }
  return y + 14;
}

function drawSummary(e: Env, b: Extract<DocBlock, { k: 'summary' }>, y: number): number {
  const { ctx, pal } = e;
  const lines = b.lines ?? [];
  const h = 92 + (lines.length ? 34 : 0);
  if (e.draw) { roundRect(ctx, L, y, CW, h, 16); ctx.fillStyle = pal.C.primary; ctx.fill(); }
  text(e, fit(e, b.label, font(600, 13.5), CW - 32), R - 16, y + 24, font(600, 13.5), 'rgba(255,255,255,0.88)');
  const vf = font(800, 28);
  text(e, b.value, R - 16, y + 54, vf, '#FFFFFF');
  text(e, b.unit, R - 16 - width(e, b.value, vf) - 8, y + 58, font(600, 13), 'rgba(255,255,255,0.88)');
  text(e, fit(e, b.meta.join('  •  '), font(500, 12.5), CW - 32), R - 16, y + 80, font(500, 12.5), 'rgba(255,255,255,0.88)');
  if (lines.length) {
    if (e.draw) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(L + 16, y + 92, CW - 32, 1); }
    const colW = (CW - 32) / lines.length;
    lines.forEach((ln, i) => {
      const cx = R - 16 - i * colW;
      text(e, `${ln.label}: ${ln.value}`, cx, y + 92 + 18, font(700, 12.5), '#FFFFFF');
    });
  }
  e.breaks.push(y + h + 8);
  return y + h + 14;
}

function drawRow(e: Env, r: DocRow, y: number, last: boolean): number {
  const { pal } = e;
  const hasIcon = !!r.type;
  const left = L, right = R;
  const vf = font(r.muted ? 600 : 800, 14.5);
  const vw = width(e, r.value, vf);
  const tagF = font(700, 11.5);
  const tagW = r.tag ? width(e, r.tag.text, tagF) + 18 : 0;
  const textRight = right - (hasIcon ? 44 : 0);
  const textMax = Math.max(80, textRight - (left + vw + (tagW ? tagW + 12 : 0) + 14));
  const labelF = font(700, 14.5), subF = font(500, 11.5);
  let subLines: string[] = [];
  if (r.sub) { e.ctx.font = subF; subLines = wrapLines(e.ctx, r.sub, Math.max(textMax, 150), 3); }
  const rowH = Math.max(r.valueSub ? 50 : 0, hasIcon ? 44 : 36, 18 + 17 + Math.max(0, subLines.length - 1) * 15 + (subLines.length ? 0 : -14) + 6);
  const mid = y + rowH / 2;
  if (hasIcon && r.type) {
    const col = typeColors(r.type, 'light', undefined, e.lp);
    if (e.draw) {
      e.ctx.beginPath(); e.ctx.arc(right - 17, mid, 17, 0, Math.PI * 2); e.ctx.fillStyle = col.iconBg; e.ctx.fill();
      const ic = e.icons.get(r.type); if (ic) e.ctx.drawImage(ic, right - 17 - 9, mid - 9, 18, 18);
    }
  }
  const top = subLines.length ? y + 10 + 8 : mid;
  text(e, fit(e, r.label, labelF, textMax), textRight, top, labelF, r.muted ? pal.C.muted : pal.C.text);
  subLines.forEach((ln, i) => text(e, ln, textRight, y + 10 + 8 + 18 + i * 15, subF, pal.C.muted));
  text(e, r.value, left, r.valueSub ? mid - 7 : mid, vf, r.muted ? pal.C.muted : r.valueOk ? pal.STATUS.settled.fg : pal.C.text, 'left');
  if (r.valueSub) text(e, r.valueSub, left, mid + 11, font(500, 10.5), pal.C.muted, 'left');
  if (r.tag) {
    const t = tone(pal, r.tag.tone), cx = left + vw + 10;
    if (e.draw) { roundRect(e.ctx, cx, mid - 11, tagW, 22, 11); e.ctx.fillStyle = t.bg; e.ctx.fill(); }
    text(e, r.tag.text, cx + tagW / 2, mid + 0.5, tagF, t.fg, 'center');
  }
  if (!last && e.draw) { e.ctx.fillStyle = pal.C.border; e.ctx.fillRect(L, y + rowH, CW, 1); }
  e.breaks.push(y + rowH);
  return y + rowH;
}

function drawBar(e: Env, lay: BarLayout, series: Extract<DocBlock, { k: 'chart' }>, y: number, colors: ChartColors): number {
  const { ctx } = e;
  const s = Math.min(1, CW / lay.width);
  const ox = L + (CW - lay.width * s) / 2;
  const X = (v: number) => ox + v * s, Y = (v: number) => y + v * s;
  const barColor = series.typeColor ? typeColors(series.typeColor, 'light', undefined, e.lp).color : e.pal.C.primary;
  const fs = (n: number) => font(700, Math.max(8, n * Math.max(s, 0.85)));
  if (e.draw) {
    ctx.setLineDash([3, 4]); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
    for (const gy of lay.gridYs) { ctx.beginPath(); ctx.moveTo(X(0), Y(gy)); ctx.lineTo(X(lay.width), Y(gy)); ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(0), Y(lay.baseY)); ctx.lineTo(X(lay.width), Y(lay.baseY)); ctx.stroke();
    if (lay.kind === 'bar') {
      for (const it of lay.items) {
        if (!it.hasData) continue;
        roundRect(ctx, X(it.barX), Y(it.barY), it.barW * s, Math.max(2, it.barH * s), 8 * s);
        ctx.globalAlpha = it.flag ? 1 : 0.72; ctx.fillStyle = barColor; ctx.fill(); ctx.globalAlpha = 1;
        if (it.flag) { ctx.lineWidth = 2.5; ctx.strokeStyle = it.flag === 'max' ? colors.up : colors.down; ctx.stroke(); }
      }
    } else {
      const pts = lay.items.filter((i) => i.hasData);
      if (pts.length) {
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.px), Y(p.py)) : ctx.moveTo(X(p.px), Y(p.py))));
        ctx.strokeStyle = barColor; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
        for (const p of pts) {
          ctx.beginPath(); ctx.arc(X(p.px), Y(p.py), (p.flag ? 7 : 5) * s, 0, Math.PI * 2); ctx.fillStyle = colors.card; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = p.flag === 'max' ? colors.up : p.flag === 'min' ? colors.down : barColor; ctx.stroke();
        }
      }
    }
  }
  for (const it of lay.items) {
    const cx = X(it.cx);
    if (it.hasData) text(e, it.valueText, cx, Y(it.py - (lay.kind === 'line' ? 13 : 8)), fs(11), colors.text, 'center');
    text(e, it.monthName, cx, Y(171), fs(12.5), colors.text, 'center');
    if (it.delta) {
      const col = it.delta.up ? colors.up : colors.down;
      text(e, `${it.delta.up ? '▲' : '▼'} ${it.delta.pctText ?? ''}`.trim(), cx, Y(189), fs(11), col, 'center');
      text(e, it.delta.amountText, cx, Y(204), font(500, Math.max(8, 10 * Math.max(s, 0.85))), col, 'center');
    } else text(e, '—', cx, Y(189), font(500, 11), colors.muted, 'center');
    if (it.flag) {
      const w = 48 * s, h = 19 * s;
      if (e.draw) { roundRect(ctx, cx - w / 2, Y(212), w, h, h / 2); ctx.fillStyle = it.flag === 'max' ? colors.upSoft : colors.downSoft; ctx.fill(); }
      text(e, it.flag === 'max' ? 'بیشترین' : 'کمترین', cx, Y(225.5), font(800, Math.max(8, 10.5 * Math.max(s, 0.85))), it.flag === 'max' ? colors.up : colors.downText, 'center');
    }
  }
  return y + lay.height * s;
}

function drawPie(e: Env, lay: PieLayout, y: number, colors: ChartColors): number {
  const { ctx } = e;
  const s = Math.min(1, CW / lay.width), ox = L + (CW - lay.width * s) / 2;
  for (const sl of lay.slices) {
    const col = typeColors(sl.type, 'light', undefined, e.lp).color;
    if (e.draw) {
      ctx.beginPath();
      if (sl.a1 - sl.a0 >= Math.PI * 2 - 1e-6) ctx.arc(ox + lay.cx * s, y + lay.cy * s, lay.r * s, 0, Math.PI * 2);
      else { ctx.moveTo(ox + lay.cx * s, y + lay.cy * s); ctx.arc(ox + lay.cx * s, y + lay.cy * s, lay.r * s, sl.a0, sl.a1); ctx.closePath(); }
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = colors.card; ctx.lineJoin = 'round'; ctx.stroke();
    }
    text(e, sl.percentText, ox + sl.lx * s, y + sl.ly * s + 5, font(800, 14), colors.card, 'center');
  }
  return y + lay.height * s;
}

function drawChart(e: Env, b: Extract<DocBlock, { k: 'chart' }>, y: number, colors: ChartColors): number {
  text(e, fit(e, b.title, font(700, 13.5), CW), R, y + 8, font(700, 13.5), e.pal.C.text2);
  y += 24;
  if (b.kind === 'pie' && b.shares) y = drawPie(e, pieLayout(b.shares), y, colors);
  else if (b.series && b.kind !== 'pie') y = drawBar(e, barLayout(b.series, b.kind), b, y, colors);
  e.breaks.push(y + 6);
  return y + 12;
}

function paint(e: Env, doc: ReportDoc, now: Date, height: number): number {
  const { ctx, pal } = e;
  if (e.draw) {
    ctx.fillStyle = pal.C.bg; ctx.fillRect(0, 0, REPORT_W, height);
    ctx.save(); ctx.shadowColor = 'rgba(33, 56, 102, 0.10)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    roundRect(ctx, M, M, REPORT_W - 2 * M, height - 2 * M, 22); ctx.fillStyle = pal.C.card; ctx.fill(); ctx.restore();
  }
  ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
  const colors = chartColors(pal);
  let y = drawHeader(e, doc, now);
  e.breaks.push(y);
  for (const b of doc.blocks) {
    switch (b.k) {
      case 'summary': y = drawSummary(e, b, y); break;
      case 'heading': y += 6; text(e, b.text, R, y + 10, font(800, 15.5), pal.C.text); y += 28; e.breaks.push(y - 20 > 0 ? y - 22 : y); break;
      case 'rows': {
        b.rows.forEach((r, i) => { y = drawRow(e, r, y, i === b.rows.length - 1 && !b.footer); });
        if (b.footer) {
          if (e.draw) { ctx.fillStyle = pal.C.border; ctx.fillRect(L, y + 2, CW, 1.5); }
          y += 4;
          text(e, b.footer.label, R, y + 20, font(800, 14.5), pal.C.text);
          text(e, b.footer.value, L, y + 20, font(800, 15.5), b.footer.ok ? pal.STATUS.settled.fg : pal.C.primary, 'left');
          if (b.footer.note) { text(e, b.footer.note, R, y + 40, font(500, 11.5), pal.C.muted); y += 18; }
          y += 40; e.breaks.push(y);
        }
        y += 6;
        break;
      }
      case 'chart': y = drawChart(e, b, y, colors); break;
      case 'note': {
        e.ctx.font = font(500, 13);
        const ls = wrapLines(e.ctx, b.text, CW, 6);
        ls.forEach((ln, i) => text(e, ln, R, y + 10 + i * 20, font(500, 13), pal.C.muted));
        y += ls.length * 20 + 12; e.breaks.push(y);
        break;
      }
    }
  }
  y += 6;
  if (e.draw) { ctx.fillStyle = pal.C.border; ctx.fillRect(L, y, CW, 1); }
  y += 18;
  text(e, `مبالغ به ${CURRENCY} است — ساخته‌شده با برنامه «${APP_NAME_FA}»`, REPORT_W / 2, y, font(500, 11.5), pal.C.muted, 'center');
  y += 18 + P + M - 8;
  return Math.ceil(y);
}

/** نتیجهٔ رسم گزارش روی canvas (یک‌بار ساخته می‌شود؛ PNG/JPEG/PDF همه از همین canvas درمی‌آیند) */
export interface ReportCanvas {
  canvas: HTMLCanvasElement;
  /** ضریب واقعی رسم (۲ یا کمتر برای گزارش‌های خیلی بلند) */
  scale: number;
  /** نقطه‌های مجاز شکست صفحه (پیکسل، از بالا) */
  breaks: number[];
  stamp: string;
  fileBase: string;
  /** نام کامل فایل بدون پسوند (اگر نباشد: apartemant-{fileBase}-{stamp}) — مثلاً برای تصویر قبض */
  fileStem?: string;
}

/** رسم گزارش روی canvas (یک‌بار). برای گزارش خیلی بلند ضریب رسم خودکار کم می‌شود تا canvas از حد WebView نگذرد */
export async function renderReportCanvas(doc: ReportDoc, now: Date = new Date()): Promise<ReportCanvas> {
  await ensureFonts();
  const lp = sanitizeLightPalette(typeof document !== 'undefined' ? document.documentElement.dataset.light : null) ?? DEFAULT_LIGHT_PALETTE;
  const pal = billImageColors(lp);
  const types = new Set<ExpenseType>();
  for (const b of doc.blocks) {
    if (b.k === 'rows') for (const r of b.rows) if (r.type) types.add(r.type);
  }
  const iconEntries = await Promise.all([...types].map(async (t) => [t, await glyphImageFor(t, typeColors(t, 'light', undefined, lp).color)] as const));
  const app = await loadImage(appIconUrl);
  const canvas = document.createElement('canvas');
  const mctx = canvas.getContext('2d');
  if (!mctx) throw new Error('canvas-unavailable');
  const env = (ctx: CanvasRenderingContext2D, draw: boolean): Env => ({ ctx, draw, pal, lp, icons: new Map(iconEntries), app, breaks: [] });
  const h = paint(env(mctx, false), doc, now, 0);
  const scale = pickReportScale(h, REPORT_W, REPORT_SCALE);
  if (scale === null) throw new Error('report-too-tall');
  canvas.width = Math.round(REPORT_W * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(canvas.width / REPORT_W, 0, 0, canvas.height / h, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  const e = env(ctx, true);
  paint(e, doc, now, h);
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // تاریخ محلی
  const k = canvas.height / h;
  const breaks = [...new Set(e.breaks.map((b) => Math.round(b * k)))].filter((b) => b > 0 && b < canvas.height).sort((a, b) => a - b);
  return { canvas, scale: canvas.width / REPORT_W, breaks, stamp, fileBase: doc.fileBase };
}

const stemOf = (r: ReportCanvas) => r.fileStem ?? `apartemant-${r.fileBase}-${r.stamp}`;

/** کدگذاری canvas به PNG (ذخیره/اشتراک/پیش‌نمایش) یا JPEG (پرینت JPEG و صفحه‌های PDF) */
export function encodeReportImage(r: ReportCanvas, format: ReportImageFormat = 'png'): RenderedReportImage {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = r.canvas.toDataURL(mime, format === 'jpeg' ? 0.92 : undefined);
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), fileName: `${stemOf(r)}.${ext}`, mime, width: r.canvas.width, height: r.canvas.height, scale: r.scale, breaks: r.breaks, canvas: r.canvas };
}

/** همان RenderedReportImage بدون کدگذاری (فقط ابعاد/نقطه‌های شکست/canvas) — برای ساخت PDF که خودش صفحه‌ها را JPEG می‌کند */
export function reportImageShell(r: ReportCanvas): RenderedReportImage {
  return { dataUrl: '', base64: '', fileName: `${stemOf(r)}.jpg`, mime: 'image/jpeg', width: r.canvas.width, height: r.canvas.height, scale: r.scale, breaks: r.breaks, canvas: r.canvas };
}

/** ساخت تصویر گزارش. PNG برای ذخیره/اشتراک؛ JPEG برای پرینت (JPEG/PDF) */
export async function renderReportImage(doc: ReportDoc, format: ReportImageFormat = 'png', now: Date = new Date()): Promise<RenderedReportImage> {
  return encodeReportImage(await renderReportCanvas(doc, now), format);
}

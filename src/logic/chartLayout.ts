/**
 * چیدمان نمودارهای «گزارش نموداری» (از ۱.۷.۰) — منطق خالص و بدون وابستگی به DOM.
 * هم SVG داخل برنامه (components/ChartSvg.tsx) و هم رسم روی canvas برای تصویر/PDF (services/reportImage.tsx)
 * از همین مختصات استفاده می‌کنند. جهت راست‌به‌چپ: اولین ماه سمت راست است.
 */
import { monthName } from '../models/constants';
import type { ChartSeries, TypeShare } from './chartReport';
import { faAmount } from './billImage';
import { toPersianDigits } from './formatting';

export const CHART_H = 238;
export const CHART_MIN_W = 326;
/** حداقل عرض هر ماه؛ برای بازه‌های بلند نمودار پهن‌تر و در برنامه قابل اسکرول افقی است */
export const SLOT_MIN = 54;
const BASE_Y = 150;
const TOP_Y = 52;

export type ChartKind = 'bar' | 'line' | 'pie';
export interface ChartColors {
  text: string; muted: string; grid: string; card: string; up: string; down: string;
  upSoft: string; downSoft: string; downText: string;
}

export interface BarDelta { up: boolean; pctText: string | null; amountText: string }
export interface BarItem {
  cx: number;
  month: number;
  monthName: string;
  value: number;
  valueText: string;
  hasData: boolean;
  barX: number; barY: number; barW: number; barH: number;
  px: number; py: number;
  flag: 'max' | 'min' | null;
  delta: BarDelta | null;
}
export interface BarLayout { kind: 'bar' | 'line'; width: number; height: number; baseY: number; gridYs: number[]; items: BarItem[] }

export const faPercent = (p: number): string => toPersianDigits(Math.abs(p).toFixed(1)).replace('.', '٫') + '٪';

export function barLayout(series: ChartSeries, kind: 'bar' | 'line'): BarLayout {
  const n = series.months.length;
  const width = Math.max(CHART_MIN_W, n * SLOT_MIN);
  const slot = width / n;
  const max = Math.max(1, ...series.months.map((m) => m.total));
  const y = (v: number) => BASE_Y - (v / max) * (BASE_Y - TOP_Y);
  const bw = Math.min(44, slot * 0.62);
  const items: BarItem[] = series.months.map((m, i) => {
    const cx = width - (i + 0.5) * slot;
    const hasData = m.count > 0;
    const py = hasData ? y(m.total) : BASE_Y;
    return {
      cx, month: m.month, monthName: monthName(m.month), value: m.total, valueText: hasData ? faAmount(m.total) : '—', hasData,
      barX: cx - bw / 2, barY: py, barW: bw, barH: BASE_Y - py, px: cx, py,
      flag: m.isMax ? 'max' : m.isMin ? 'min' : null,
      delta: m.delta === null ? null : { up: m.delta > 0, pctText: m.percent === null ? null : faPercent(m.percent), amountText: (m.delta > 0 ? '+' : m.delta < 0 ? '−' : '') + faAmount(Math.abs(m.delta)) },
    };
  });
  return { kind, width, height: CHART_H, baseY: BASE_Y, gridYs: [BASE_Y - 0.5 * (BASE_Y - TOP_Y), TOP_Y], items };
}

export interface PieSlice { type: TypeShare['type']; a0: number; a1: number; percentText: string; lx: number; ly: number; big: boolean }
export interface PieLayout { width: number; height: number; cx: number; cy: number; r: number; slices: PieSlice[] }

export function pieLayout(shares: TypeShare[]): PieLayout {
  const width = CHART_MIN_W, height = 224, cx = width / 2, cy = 112, r = 98;
  const total = shares.reduce((s, x) => s + x.total, 0);
  let a0 = -Math.PI / 2;
  const slices = shares.map((s) => {
    const ang = total > 0 ? (s.total / total) * Math.PI * 2 : 0;
    const a1 = a0 + ang, am = (a0 + a1) / 2;
    const out: PieSlice = { type: s.type, a0, a1, percentText: faPercent(s.percent), lx: cx + r * 0.62 * Math.cos(am), ly: cy + r * 0.62 * Math.sin(am), big: ang > Math.PI };
    a0 = a1;
    return out;
  });
  return { width, height, cx, cy, r, slices };
}

/** مسیر SVG یک برش دایره؛ برش ۱۰۰٪ دایرهٔ کامل است */
export function pieSlicePath(l: PieLayout, s: PieSlice): string {
  const { cx, cy, r } = l;
  if (s.a1 - s.a0 >= Math.PI * 2 - 1e-6) return `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  const p = (a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M${cx} ${cy} L${p(s.a0)} A${r} ${r} 0 ${s.big ? 1 : 0} 1 ${p(s.a1)} Z`;
}

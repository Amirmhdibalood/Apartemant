import { useId } from 'react';
import type { ExpenseType } from '../models/types';
import { barLayout, pieLayout, pieSlicePath, type ChartColors } from '../logic/chartLayout';
import type { ChartSeries, TypeShare } from '../logic/chartReport';
import { useTheme } from '../context/ThemeContext';
import { typeBarColor } from '../logic/typeColor';

/** رنگ‌ها از متغیرهای CSS تم (روشن/تاریک خودکار) */
const COLORS: ChartColors = {
  text: 'var(--text)', muted: 'var(--muted)', grid: 'var(--border-2)', card: 'var(--card)',
  up: 'var(--danger)', down: 'var(--success)', upSoft: 'var(--danger-soft)', downSoft: 'var(--success-soft)', downText: 'var(--success-press)',
};

interface BarProps { series: ChartSeries; kind: 'bar' | 'line'; type: ExpenseType | null }

/** نمودار میله‌ای/خطی SVG (بدون کتابخانهٔ بیرونی)؛ برای بازه‌های بلند در برنامه به‌صورت افقی اسکرول می‌شود */
export function BarLineChart({ series, kind, type }: BarProps) {
  const { theme } = useTheme();
  const gid = useId();
  const lay = barLayout(series, kind);
  const c = COLORS;
  const color = type ? typeBarColor(type, theme) : 'var(--primary)';
  const pts = lay.items.filter((i) => i.hasData);
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${lay.width} ${lay.height}`} width={lay.width > 340 ? lay.width : undefined} className="chart-svg" role="img" aria-label={kind === 'bar' ? 'نمودار میله‌ای' : 'نمودار خطی'}>
        {lay.gridYs.map((y) => <line key={y} x1={0} x2={lay.width} y1={y} y2={y} style={{ stroke: c.grid }} strokeDasharray="3 4" />)}
        <line x1={0} x2={lay.width} y1={lay.baseY} y2={lay.baseY} style={{ stroke: c.grid }} strokeWidth={1.5} />
        {kind === 'bar' && lay.items.filter((i) => i.hasData).map((it) => (
          <rect key={it.month} x={it.barX} y={it.barY} width={it.barW} height={Math.max(2, it.barH)} rx={9} fill={color} fillOpacity={it.flag ? 1 : 0.72}
            style={{ stroke: it.flag === 'max' ? c.up : it.flag === 'min' ? c.down : 'none' }} strokeWidth={it.flag ? 2.5 : 0} />
        ))}
        {kind === 'line' && pts.length > 0 && (
          <>
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".30" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            <path d={`M${pts[0].px} ${lay.baseY} L${pts.map((p) => `${p.px} ${p.py}`).join(' L')} L${pts[pts.length - 1].px} ${lay.baseY} Z`} fill={`url(#${gid})`} />
            <polyline points={pts.map((p) => `${p.px},${p.py}`).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p) => <circle key={p.month} cx={p.px} cy={p.py} r={p.flag ? 7 : 5} style={{ fill: c.card, stroke: p.flag === 'max' ? c.up : p.flag === 'min' ? c.down : color }} strokeWidth={3} />)}
          </>
        )}
        {lay.items.map((it) => (
          <g key={it.month}>
            {it.hasData && <text x={it.cx} y={it.py - (kind === 'line' ? 13 : 8)} textAnchor="middle" fontSize={11} fontWeight={800} style={{ fill: c.text }}>{it.valueText}</text>}
            <text x={it.cx} y={171} textAnchor="middle" fontSize={12.5} fontWeight={800} style={{ fill: c.text }}>{it.monthName}</text>
            {it.delta ? (
              <>
                <text x={it.cx} y={189} textAnchor="middle" fontSize={11} fontWeight={800} style={{ fill: it.delta.up ? c.up : c.down }}>{it.delta.up ? '▲' : '▼'} {it.delta.pctText}</text>
                <text x={it.cx} y={204} textAnchor="middle" fontSize={10} style={{ fill: it.delta.up ? c.up : c.down }}>{it.delta.amountText}</text>
              </>
            ) : <text x={it.cx} y={189} textAnchor="middle" fontSize={11} style={{ fill: c.muted }}>—</text>}
            {it.flag && (
              <>
                <rect x={it.cx - 24} y={212} width={48} height={19} rx={9.5} style={{ fill: it.flag === 'max' ? c.upSoft : c.downSoft }} />
                <text x={it.cx} y={225.5} textAnchor="middle" fontSize={10.5} fontWeight={800} style={{ fill: it.flag === 'max' ? c.up : c.downText }}>{it.flag === 'max' ? 'بیشترین' : 'کمترین'}</text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function PieChart({ shares }: { shares: TypeShare[] }) {
  const { theme } = useTheme();
  const lay = pieLayout(shares);
  return (
    <svg viewBox={`0 0 ${lay.width} ${lay.height}`} className="chart-svg" role="img" aria-label="نمودار دایره‌ای">
      {lay.slices.map((s) => <path key={s.type} d={pieSlicePath(lay, s)} fill={typeBarColor(s.type, theme)} style={{ stroke: COLORS.card }} strokeWidth={3} strokeLinejoin="round" />)}
      {lay.slices.map((s) => <text key={'t' + s.type} x={s.lx} y={s.ly + 5} textAnchor="middle" fontSize={14} fontWeight={800} style={{ fill: COLORS.card }}>{s.percentText}</text>)}
    </svg>
  );
}

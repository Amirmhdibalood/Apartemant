import type { AreaIconId, UnitIconId } from '../logic/iconPrefs';
import { toPersianDigits } from '../logic/formatting';
import { IconAreaM2, IconUser } from './Icons';

function Svg({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** نماد واحد (آواتار هر واحد). `number` فقط برای گزینهٔ «شماره‌ی واحد» لازم است. */
export function UnitIcon({ id, number, size = 16 }: { id: UnitIconId; number?: number; size?: number }) {
  switch (id) {
    case 'door':
      return (<Svg size={size}><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21" /><path d="M3.5 21h17" /><circle cx="14.2" cy="12.4" r="0.9" fill="currentColor" /></Svg>);
    case 'building':
      return (<Svg size={size}><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M10 21v-4h4v4" /></Svg>);
    case 'key':
      return (<Svg size={size}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3M16.5 6.5l2.5 2.5M14 9l2 2" /></Svg>);
    case 'home':
      return (<Svg size={size}><path d="M3.5 11L12 3.5 20.5 11" /><path d="M5.5 9.5V20.5h13V9.5" /><path d="M10 20.5v-6h4v6" /></Svg>);
    case 'number':
      return <span className="unit-num" style={{ fontSize: Math.round(size * 0.85) }}>{toPersianDigits(number ?? 1)}</span>;
    default:
      return <IconUser size={size} />;
  }
}

/** نماد متراژ (نشان سرستون). «بدون نماد» چیزی رسم نمی‌کند. */
export function AreaIcon({ id, size = 14 }: { id: AreaIconId; size?: number }) {
  switch (id) {
    case 'arrows':
      return (<Svg size={size}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M8.5 15.5l7-7M11.5 8.5h4v4M12.5 15.5h-4v-4" /></Svg>);
    case 'plan':
      return (<Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h7M10 12V3M10 16v5M15 12h6M15 12v9" /></Svg>);
    case 'expand':
      return (<Svg size={size}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>);
    case 'homeRuler':
      return (<Svg size={size}><path d="M3 10.5L12 3l9 7.5" /><path d="M5.5 9v4M18.5 9v4" /><rect x="3" y="15" width="18" height="6" rx="1.4" /><path d="M7 15v2.5M11 15v3M15 15v2.5M19 15v3" /></Svg>);
    case 'none':
      return null;
    default:
      return <IconAreaM2 size={size} />;
  }
}

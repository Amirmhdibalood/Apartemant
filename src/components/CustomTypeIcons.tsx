/** ۱۲ نماد نوع‌های قبض سفارشی (خطی، شبکهٔ ۲۴، موکاپ تأییدشدهٔ ۱۰-b) */
import type { ReactNode } from 'react';
import type { CustomIconId } from '../logic/billTypes';

const PATHS: Record<CustomIconId, ReactNode> = {
  elevator: (<><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M12 2.5v19" /><path d="m6.5 9.5 2-2.5 2 2.5M13.5 14.5l2 2.5 2-2.5" /></>),
  shield: (<><path d="M12 2.8 4.5 5.6v5.6c0 4.7 3.2 8.6 7.5 10 4.3-1.4 7.5-5.3 7.5-10V5.6z" /><path d="m8.8 12 2.2 2.2 4.3-4.4" /></>),
  leaf: (<><path d="M5 19C5 10 10 5 20 4c-.5 10-5.5 15-14 15" /><path d="M5 19l7-7" /></>),
  trash: (<><path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14" /><path d="M10 10.5v6M14 10.5v6" /></>),
  camera: (<><path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.6-2.2h6.4l1.6 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.6" /></>),
  key: (<><circle cx="7.5" cy="15.5" r="4" /><path d="m10.4 12.6 9.1-9.1M16 7l2.5 2.5M13.5 9.5 15.5 11.5" /></>),
  parking: (<><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M9.5 17V7.5h3.3a2.8 2.8 0 0 1 0 5.6H9.5" /></>),
  pool: (<><path d="M3 17.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" /><path d="M8 14V5.5a2 2 0 0 1 4 0M16 14V5.5a2 2 0 0 0-4 0M8 9h8" /></>),
  fan: (<><circle cx="12" cy="12" r="1.8" /><path d="M12 10.2c-.6-3.6.6-6.7 3.4-6.7 2.2 0 2.4 3.4-1.6 6.6M13.8 12c3.6-.6 6.7.6 6.7 3.4 0 2.2-3.4 2.4-6.6-1.6M12 13.8c.6 3.6-.6 6.7-3.4 6.7-2.2 0-2.4-3.4 1.6-6.6M10.2 12c-3.6.6-6.7-.6-6.7-3.4 0-2.2 3.4-2.4 6.6 1.6" /></>),
  wifi: (<><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 15.8a5 5 0 0 1 6.8 0" /><circle cx="12" cy="19" r="1.1" fill="currentColor" /></>),
  bell: (<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>),
  bulb: (<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>),
};

export function CustomTypeGlyph({ icon, size = 22, color }: { icon: CustomIconId; size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={color ? { color } : undefined}
    >
      {PATHS[icon] ?? PATHS.bell}
    </svg>
  );
}

import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const S = ({ size = 22, children, ...rest }: P & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconDrop = (p: P) => (
  <S {...p} stroke="none" fill="currentColor">
    <path d="M12 2.2c-.3 0-.6.15-.8.4C9.6 4.6 5 10.3 5 14.8a7 7 0 0 0 14 0c0-4.5-4.6-10.2-6.2-12.2a1 1 0 0 0-.8-.4z" />
    <path d="M9.2 14.6a.9.9 0 0 0-.9.9 3.9 3.9 0 0 0 3.2 3.6.9.9 0 1 0 .3-1.8 2.1 2.1 0 0 1-1.7-1.9.9.9 0 0 0-.9-.8z" fill="#fff" opacity=".55" />
  </S>
);
export const IconBolt = (p: P) => (
  <S {...p} stroke="none" fill="currentColor">
    <path d="M13.6 2.3a.7.7 0 0 0-1.2-.4L4.2 12.8a.8.8 0 0 0 .6 1.2H11l-1.3 7.6a.7.7 0 0 0 1.2.5l8.3-10.9a.8.8 0 0 0-.6-1.2h-6.3z" />
  </S>
);
export const IconFlame = (p: P) => (
  <S {...p} stroke="none" fill="currentColor">
    <path d="M12.6 2.2c.5 2.8 2.1 4.6 3.7 6.2 1.7 1.7 3.2 3.4 3.2 6.2A7.5 7.5 0 0 1 12 22a7.5 7.5 0 0 1-7.5-7.4c0-2.3 1-4.1 2.3-5.4.3 1.6 1.2 2.7 2.4 3.1-.6-3.8 1.2-7.3 3.4-10.1z" />
    <path d="M12.2 12.5c1.9 1.5 3.3 2.9 3.3 4.8a3.5 3.5 0 0 1-7 0c0-1.2.6-2.2 1.4-2.9.2.8.7 1.3 1.3 1.5-.2-1.3.2-2.4 1-3.4z" fill="#fff" opacity=".8" />
  </S>
);
export const IconBuilding = (p: P) => (
  <S {...p} strokeWidth={2}>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15M3 21h18" />
  </S>
);
export const IconBroom = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M19.5 3.5 12 11" />
    <path d="M9.6 9.8 14.2 14.4c-.6 3.3-3.1 6.1-6.6 6.9l-.8.2c-1.1-1.6-2.3-3.2-3.8-4.6 1.4.2 2.6-.1 3.5-.9-1.4-.6-2.5-1.5-3.2-2.7 2.3-.2 4.2-1.3 6.3-3.5z" />
    <path d="M7.2 16.5 9.5 18.8" />
  </S>
);
export const IconWrench = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </S>
);
export const IconSparkles = (p: P) => (
  <S {...p} stroke="none" fill="currentColor">
    <path d="M10 2.5c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6z" />
    <path d="M17.5 12.5c.25 2.4 1.3 3.45 3.7 3.7-2.4.25-3.45 1.3-3.7 3.7-.25-2.4-1.3-3.45-3.7-3.7 2.4-.25 3.45-1.3 3.7-3.7z" opacity=".75" />
    <path d="M5.5 16.5c.15 1.4.75 2 2.2 2.2-1.45.15-2.05.75-2.2 2.2-.15-1.45-.75-2.05-2.2-2.2 1.45-.15 2.05-.75 2.2-2.2z" opacity=".6" />
  </S>
);
export const IconChart = (p: P) => (
  <S {...p}>
    <path d="M3.5 20.5h17" />
    <rect x="5" y="11" width="3.2" height="7" rx="1" />
    <rect x="10.4" y="6" width="3.2" height="12" rx="1" />
    <rect x="15.8" y="13.5" width="3.2" height="4.5" rx="1" />
  </S>
);
export const IconDots = (p: P) => (
  <S {...p} stroke="none" fill="currentColor">
    <circle cx="8" cy="8" r="2" />
    <circle cx="16" cy="8" r="2" />
    <circle cx="8" cy="16" r="2" />
    <circle cx="16" cy="16" r="2" />
  </S>
);
export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IconMinus = (p: P) => (
  <S {...p}>
    <path d="M5 12h14" />
  </S>
);
export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
  </S>
);
export const IconUser = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M5 21a7 7 0 0 1 14 0" />
  </S>
);
export const IconHistory = (p: P) => (
  <S {...p}>
    <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3" />
    <path d="M3 3v5.3h5.3M12 7v5l3.5 2" />
  </S>
);
export const IconBook = (p: P) => (
  <S {...p}>
    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
    <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
  </S>
);
export const IconGear = (p: P) => (
  <S {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </S>
);
export const IconHome = (p: P) => (
  <S {...p}>
    <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </S>
);
export const IconCalendar = (p: P) => (
  <S {...p}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
    <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" strokeWidth={2.6} />
  </S>
);
export const IconCalendarSave = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
    <path d="M8 2.5v4M16 2.5v4M3.5 10h17" />
    <rect x="8.5" y="13" width="7" height="4.5" rx="1" />
  </S>
);
export const IconChevronLeft = (p: P) => (
  <S {...p}>
    <path d="m15 18-6-6 6-6" />
  </S>
);
export const IconChevronDown = (p: P) => (
  <S {...p}>
    <path d="m6 9 6 6 6-6" />
  </S>
);
export const IconEdit = (p: P) => (
  <S {...p}>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.5 14.5 8.5 15.5l1-4z" />
  </S>
);
export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="4" y="10.5" width="16" height="11" rx="2.5" />
    <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    <path d="M12 15v2" />
  </S>
);
export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M20 6 9 17l-5-5" />
  </S>
);
export const IconShare = (p: P) => (
  <S {...p}>
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </S>
);
export const IconRestore = (p: P) => (
  <S {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </S>
);
export const IconShield = (p: P) => (
  <S {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </S>
);
export const IconX = (p: P) => (
  <S {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </S>
);
export const IconAlertTriangle = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <path d="M28.5 8.6a4 4 0 0 1 7 0l24 42A4 4 0 0 1 56 56.6H8a4 4 0 0 1-3.5-6z" fill="#F7C23C" />
    <rect x="29.5" y="22" width="5" height="18" rx="2.5" fill="#fff" />
    <circle cx="32" cy="47" r="3.2" fill="#fff" />
  </svg>
);
export const IconErrorCircle = ({ size = 52 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="28" fill="#EF4444" />
    <path d="M23 23l18 18M41 23 23 41" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
  </svg>
);
export const IconSuccessCircle = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#22A861" />
    <path d="m7 12.3 3.2 3.2L17.2 8.6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
/** ذخیره تصویر در گالری */
export const IconImageDown = (p: P) => (
  <S {...p}>
    <path d="M21 12.5V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h6" />
    <path d="m3.5 17 4.8-4.8a1.6 1.6 0 0 1 2.3 0L16 17.5" />
    <path d="m14 15 1.6-1.6a1.6 1.6 0 0 1 2.3 0L21 16.5" />
    <path d="M18 3v7" />
    <path d="m15 7.2 3 3 3-3" />
  </S>
);

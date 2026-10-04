import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  labelledBy?: string;
  variant?: 'default' | 'error' | 'warning' | 'lock';
}

/** پایه همه Dialogها: پس‌زمینه تیره، کارت سفید گرد وسط صفحه */
export function Dialog({ open, onClose, children, labelledBy, variant = 'default' }: Props) {
  useEffect(() => {
    if (!open) return;
    // اگر «پیش‌نمایش خروجی» روی دیالوگ باز است، Esc/Back اول همان را می‌بندد
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.pv')) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className={`dialog dialog--${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

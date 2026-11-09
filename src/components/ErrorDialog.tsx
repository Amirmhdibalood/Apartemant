import type { AppError } from '../logic/errors';
import { ERROR_TITLE } from '../logic/errors';
import { Dialog } from './Dialog';
import { IconErrorCircle } from './Icons';

export interface ErrorAction {
  label: string;
  onClick: () => void;
}

/**
 * نمایش خطا (Error): آیکون قرمز، بدون گزینه «دیگر این پیام را نمایش نده»
 * دکمهٔ میان‌بر اختیاری (مثلاً رفتن به «مدیر ساختمان»).
 */
export function ErrorDialog({ errors, onClose, actions }: { errors: AppError[] | null; onClose: () => void; actions?: ErrorAction[] }) {
  const open = !!errors && errors.length > 0;
  return (
    <Dialog open={open} onClose={onClose} labelledBy="error-title" variant="error">
      <div className="dialog__icon"><IconErrorCircle size={48} /></div>
      <h2 id="error-title" className="dialog__title">{(errors && errors.find((x) => x.title)?.title) || ERROR_TITLE}</h2>
      {errors && errors.length === 1 && <p className="dialog__text">{errors[0].message}</p>}
      {errors && errors.length > 1 && (
        <ul className="dialog__list">
          {errors.map((e, i) => <li key={i}>{e.message}</li>)}
        </ul>
      )}
      {actions && actions.length > 0 && (
        <div className="dialog__actions dialog__actions--stack" style={{ marginTop: 12 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="btn btn--soft btn--block"
              onClick={() => { onClose(); a.onClick(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>متوجه شدم</button>
      </div>
    </Dialog>
  );
}

import type { AppError } from '../logic/errors';
import { ERROR_TITLE } from '../logic/errors';
import { Dialog } from './Dialog';
import { IconErrorCircle } from './Icons';

/**
 * نمایش خطا (Error): آیکون قرمز، بدون گزینه «دیگر این پیام را نمایش نده»
 */
export function ErrorDialog({ errors, onClose }: { errors: AppError[] | null; onClose: () => void }) {
  const open = !!errors && errors.length > 0;
  return (
    <Dialog open={open} onClose={onClose} labelledBy="error-title" variant="error">
      <div className="dialog__icon"><IconErrorCircle size={48} /></div>
      <h2 id="error-title" className="dialog__title">{errors && errors.length === 1 && errors[0].title ? errors[0].title : ERROR_TITLE}</h2>
      {errors && errors.length === 1 && <p className="dialog__text">{errors[0].message}</p>}
      {errors && errors.length > 1 && (
        <ul className="dialog__list">
          {errors.map((e, i) => <li key={i}>{e.message}</li>)}
        </ul>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={onClose} autoFocus>متوجه شدم</button>
      </div>
    </Dialog>
  );
}

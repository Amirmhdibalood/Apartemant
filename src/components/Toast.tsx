import { IconSuccessCircle, IconX } from './Icons';

/** پیام موفقیت کوتاه (Toast) — مطابق تصویر مرجع */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <IconSuccessCircle size={26} />
      <span className="toast__text">{message}</span>
      <button type="button" className="toast__close" onClick={onClose} aria-label="بستن">
        <IconX size={16} />
      </button>
    </div>
  );
}

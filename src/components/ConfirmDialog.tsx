import { Dialog } from './Dialog';
import { IconAlertTriangle, IconTrash } from './Icons';

interface Props {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onResult: (ok: boolean) => void;
  /** «warning»: آیکون هشدار و دکمه آبی (برای تأییدهای غیرحذفی) */
  tone?: 'danger' | 'warning';
}

/** تأیید عملیات حذف (قرمز) */
export function ConfirmDialog({ open, title, text, confirmLabel, onResult, tone = 'danger' }: Props) {
  return (
    <Dialog open={open} onClose={() => onResult(false)} labelledBy="confirm-title">
      {tone === 'warning' ? (
        <div className="dialog__icon"><IconAlertTriangle size={54} /></div>
      ) : (
        <div className="dialog__icon dialog__icon--danger"><IconTrash size={30} /></div>
      )}
      <h2 id="confirm-title" className="dialog__title">{title}</h2>
      <p className="dialog__text dialog__text--pre">{text}</p>
      <div className="dialog__actions dialog__actions--two">
        <button type="button" className={tone === 'warning' ? 'btn btn--primary' : 'btn btn--danger'} onClick={() => onResult(true)}>{confirmLabel}</button>
        <button type="button" className="btn btn--muted" onClick={() => onResult(false)}>انصراف</button>
      </div>
    </Dialog>
  );
}

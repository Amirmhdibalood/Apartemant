import { Dialog } from './Dialog';
import { IconTrash } from './Icons';

interface Props {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onResult: (ok: boolean) => void;
}

/** تأیید عملیات حذف (قرمز) */
export function ConfirmDialog({ open, title, text, confirmLabel, onResult }: Props) {
  return (
    <Dialog open={open} onClose={() => onResult(false)} labelledBy="confirm-title">
      <div className="dialog__icon dialog__icon--danger"><IconTrash size={30} /></div>
      <h2 id="confirm-title" className="dialog__title">{title}</h2>
      <p className="dialog__text">{text}</p>
      <div className="dialog__actions dialog__actions--two">
        <button type="button" className="btn btn--danger" onClick={() => onResult(true)}>{confirmLabel}</button>
        <button type="button" className="btn btn--muted" onClick={() => onResult(false)}>انصراف</button>
      </div>
    </Dialog>
  );
}

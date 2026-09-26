import { Dialog } from './Dialog';
import { IconLock } from './Icons';

/** محدودیت منطقی (نه Error): قبض تسویه‌شده قابل ویرایش نیست */
export function LockedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="locked-title" variant="lock">
      <div className="dialog__icon dialog__icon--lock"><IconLock size={46} strokeWidth={2.2} /></div>
      <h2 id="locked-title" className="dialog__title">امکان ویرایش وجود ندارد</h2>
      <p className="dialog__text">این قبض به‌طور کامل تسویه شده است و امکان ویرایش آن وجود ندارد.</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={onClose} autoFocus>متوجه شدم</button>
      </div>
    </Dialog>
  );
}

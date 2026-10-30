import { Dialog } from './Dialog';
import { IconUserSwap } from './Icons';
import { toPersianDigits } from '../logic/formatting';
import type { ManagerSwapPlan } from '../logic/managerSwap';

const faDate = (key: string) => toPersianDigits(key.replace(/-/g, '/'));

interface Props {
  plan: ManagerSwapPlan | null;
  onResult: (ok: boolean) => void;
}

/** «این ساختمان مدیر فعال دارد» — تأیید بستن دورهٔ فعلی قبل از تعریف مدیر جدید */
export function ManagerSwapDialog({ plan, onResult }: Props) {
  return (
    <Dialog open={!!plan} onClose={() => onResult(false)} labelledBy="mgr-swap-title">
      {plan && (
        <>
          <div className="dialog__icon dialog__icon--swap"><IconUserSwap size={30} /></div>
          <h2 id="mgr-swap-title" className="dialog__title">این ساختمان مدیر فعال دارد</h2>
          <p className="dialog__text">اگر مدیر جدید تعریف کنید، دورهٔ مدیریت فعلی بسته می‌شود. تاریخچهٔ آن پاک نمی‌شود.</p>
          <div className="mgr-swap">
            <div className="mgr-swap__row">
              <span className="mgr-swap__k">مدیر فعلی</span>
              <span className="mgr-swap__v">{plan.current.managerLabel}<small>از {faDate(plan.current.startDate)}</small></span>
            </div>
            <div className="mgr-swap__row is-close">
              <span className="mgr-swap__k">بسته می‌شود</span>
              <span className="mgr-swap__v">امروز<small>{faDate(plan.closeDate)}</small></span>
            </div>
            <div className="mgr-swap__row is-new">
              <span className="mgr-swap__k">مدیر جدید</span>
              <span className="mgr-swap__v">{plan.newLabel}<small>از {faDate(plan.newStart)}</small></span>
            </div>
          </div>
          <div className="dialog__actions dialog__actions--stack">
            <button type="button" className="btn btn--primary" onClick={() => onResult(true)}>بستن دوره و تعریف مدیر جدید</button>
            <button type="button" className="btn btn--muted" onClick={() => onResult(false)}>ادامه با مدیر فعلی</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

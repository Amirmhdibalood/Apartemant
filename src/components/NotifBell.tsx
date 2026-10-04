import { IconBell } from './Icons';
import { useNotif } from '../context/NotifContext';
import { toPersianDigits } from '../logic/formatting';

/** زنگوله اعلان‌ها با عدد قرمز (تعداد همه اعلان‌های فعال) — کنار «پشتیبانی» و دکمه تم */
export function NotifBell() {
  const { all, open, setOpen } = useNotif();
  const count = all.length;
  return (
    <button
      type="button"
      className={'icon-btn bell-btn' + (open ? ' is-open' : '')}
      onClick={() => setOpen(!open)}
      aria-label={count > 0 ? `اعلان‌ها (${toPersianDigits(count)} مورد)` : 'اعلان‌ها'}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <IconBell size={24} />
      {count > 0 && <span className="bell-badge num">{toPersianDigits(count)}</span>}
    </button>
  );
}

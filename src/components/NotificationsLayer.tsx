import { useEffect, useLayoutEffect, useState } from 'react';
import { EXPENSE_TYPES } from '../models/constants';
import { ExpenseIcon } from './ExpenseIcon';
import { IconBell, IconChevronLeft, IconX } from './Icons';
import { useNotif } from '../context/NotifContext';
import { alertChipText, groupAlerts, type DueAlert } from '../logic/dueAlerts';
import { popoverAnchor } from '../logic/popoverAnchor';
import { toPersianDigits } from '../logic/formatting';

const fmtDue = (d: string | null) => (d ? toPersianDigits(d.replace(/-/g, '/')) : '');

function Item({ a, onGo }: { a: DueAlert; onGo: () => void }) {
  return (
    <button type="button" className={'notif-item is-' + a.kind} onClick={onGo}>
      <ExpenseIcon type={a.expenseType} size={42} />
      <span className="notif-item__body">
        <span className="notif-item__title">قبض {EXPENSE_TYPES[a.expenseType].label} <span className="notif-item__period">{a.title.replace(/^[^(]*/, '')}</span></span>
        <span className="notif-item__meta">
          <span className={'notif-chip is-' + a.kind}>{alertChipText(a)}</span>
          {a.dueDate && <span>مهلت: <span className="num">{fmtDue(a.dueDate)}</span></span>}
        </span>
      </span>
      <IconChevronLeft size={16} className="notif-item__arrow" />
    </button>
  );
}

/** پنجره/پنل اعلان‌ها: «پنجره پایین» یا «پنل کشویی زیر زنگوله» (بر اساس تنظیمات) */
export function NotificationsLayer({ onOpenBill }: { onOpenBill: (billId: string) => void }) {
  const { all, open, setOpen, mode } = useNotif();
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; arrowLeft: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) { setExpanded(false); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // موقعیت پنل کشویی و فلش آن زیر زنگولهٔ واقعی
  useLayoutEffect(() => {
    if (!open || mode !== 'dropdown') return;
    const bell = document.querySelector('.bell-btn');
    if (!bell) return;
    const r = bell.getBoundingClientRect();
    setAnchor(popoverAnchor(r, document.documentElement.clientWidth));
  }, [open, mode]);

  if (!open) return null;
  const close = () => setOpen(false);
  const go = (a: DueAlert) => { setOpen(false); onOpenBill(a.billId); };
  const count = toPersianDigits(all.length);

  if (mode === 'dropdown') {
    const shown = expanded ? all : all.slice(0, 4);
    return (
      <div className="notif-backdrop notif-backdrop--light" onClick={close}>
        <div
          className="notif-pop"
          role="dialog"
          aria-label="اعلان‌ها"
          style={anchor ? { top: anchor.top, left: anchor.left } : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="notif-pop__arrow" style={anchor ? { left: anchor.arrowLeft } : undefined} />
          <div className="notif-pop__head"><b>اعلان‌ها</b><span className="notif-count num">{count}</span></div>
          {all.length === 0 && <p className="notif-empty">اعلان فعالی نیست.</p>}
          <div className={'notif-list notif-list--flat' + (expanded ? ' is-expanded' : '')}>{shown.map((a) => <Item key={a.key} a={a} onGo={() => go(a)} />)}</div>
          {!expanded && all.length > shown.length && (
            <button type="button" className="notif-pop__more" onClick={() => setExpanded(true)}>
              مشاهده همه <span className="num">({count})</span> اعلان
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="notif-backdrop" onClick={close}>
      <div className="notif-sheet" role="dialog" aria-label="اعلان‌ها" onClick={(e) => e.stopPropagation()}>
        <div className="notif-sheet__handle" />
        <div className="notif-sheet__head">
          <h2><IconBell size={20} /> اعلان‌ها <span className="notif-count num">{count}</span></h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="بستن"><IconX size={20} /></button>
        </div>
        <div className="notif-sheet__body">
          {all.length === 0 && <p className="notif-empty">اعلان فعالی نیست. قبض‌هایی که مهلتشان تا ۲ روز دیگر است، امروز است یا گذشته، اینجا نمایش داده می‌شوند.</p>}
          {groupAlerts(all).map((g) => (
            <section key={g.kind} className="notif-sec">
              <h3 className={'notif-sec__title is-' + g.kind}>{g.title} <span className="num">({toPersianDigits(g.items.length)})</span></h3>
              <div className="notif-list">{g.items.map((a) => <Item key={a.key} a={a} onGo={() => go(a)} />)}</div>
            </section>
          ))}
          <p className="notif-foot">اعلان‌ها فقط داخل برنامه نمایش داده می‌شوند و هیچ مجوزی نیاز ندارند.</p>
        </div>
      </div>
    </div>
  );
}

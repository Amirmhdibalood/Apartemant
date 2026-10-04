import { useEffect, useMemo, useState } from 'react';
import { unitLabel } from '../logic/building';
import type { BillWithUnits } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { useVisibleBills } from '../context/EntryPrefsContext';
import { billRepository } from '../storage/billRepository';
import { formatAmount } from '../logic/formatting';
import { formatJalaliDate } from '../logic/date';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { listUnitBatches, undoBatch } from '../logic/unitPayment';
import { paymentHistory, PAYMENT_GRACE_DAYS, RATING_LABELS, type PaymentEntry } from '../logic/debts';

interface Props {
  unitNumber: number;
  onBack: () => void;
  onOpenBill: (billId: string) => void;
}

const date = (iso: string) => formatJalaliDate(new Date(iso));

function StatusBadge({ e }: { e: PaymentEntry }) {
  switch (e.status) {
    case 'onTime':
      return <span className="pay-badge is-ok">به‌موقع</span>;
    case 'late':
      return <span className="pay-badge is-late"><span className="num">{e.daysLate}</span> روز تأخیر</span>;
    case 'unknownDate':
      return <span className="pay-badge is-muted">پرداخت‌شده</span>;
    default:
      return (
        <span className="pay-badge is-due">
          {e.paid > 0 ? 'پرداخت جزئی' : 'پرداخت‌نشده'}{e.daysLate > 0 && <> · <span className="num">{e.daysLate}</span> روز تأخیر</>}
        </span>
      );
  }
}

/** سابقه پرداخت یک واحد: تاریخ ثبت قبض در برابر تاریخ پرداخت و روزهای تأخیر */
export function UnitHistoryScreen({ unitNumber, onBack, onOpenBill }: Props) {
  const [allRaw, setAll] = useState<BillWithUnits[] | null>(null);
  const all = useVisibleBills(allRaw);
  useEffect(() => {
    let alive = true;
    billRepository.getAll().then((r) => { if (alive) setAll(r); });
    return () => { alive = false; };
  }, []);
  const h = useMemo(() => paymentHistory(all ?? [], unitNumber), [all, unitNumber]);
  const { confirmDanger, toast, showErrors } = useFeedback();
  // پرداخت‌های ثبت‌شده با «پرداخت بدهی» (قابل لغو) — از همهٔ قبض‌ها، حتی نوع خاموش
  const batches = useMemo(() => listUnitBatches(allRaw ?? [], unitNumber), [allRaw, unitNumber]);
  const cancelBatch = async (batchId: string, total: number) => {
    const ok = await confirmDanger({
      title: 'لغو این پرداخت', text: `پرداخت ${formatAmount(total)} ${CURRENCY} برگردانده می‌شود و بدهی قبض‌ها به حالت قبل برمی‌گردد.`, confirmLabel: 'لغو پرداخت',
    });
    if (!ok) return;
    try {
      const raw = await billRepository.getAllWithDeleted();
      await billRepository.upsertMany(undoBatch(raw, batchId));
      setAll(await billRepository.getAll());
      toast('پرداخت لغو شد.');
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  return (
    <>
      <AppHeader title={`سابقه پرداخت ${unitLabel(unitNumber, h.alias)}`} onBack={onBack} />
      <main className="screen screen--report">
        {all && h.entries.length === 0 && <div className="empty-state"><p>برای این واحد قبضی ثبت نشده است.</p></div>}
        {all && h.entries.length > 0 && (
          <>
            <section className={'payer-card is-' + h.rating}>
              <div className="payer-card__top">
                <span className="payer-card__label">وضعیت پرداخت</span>
                <span className="payer-card__rating">{RATING_LABELS[h.rating]}</span>
              </div>
              <div className="payer-grid">
                <div><span>جمع سهم</span><b className="num">{formatAmount(h.totalBilled)}</b></div>
                <div><span>پرداخت‌شده</span><b className="num">{formatAmount(h.totalPaid)}</b></div>
                <div><span>بدهی</span><b className={'num' + (h.totalOwed > 0 ? ' is-due' : '')}>{formatAmount(h.totalOwed)}</b></div>
                <div><span>به‌موقع / با تأخیر</span><b><span className="num">{h.onTimeCount}</span> / <span className="num">{h.lateCount}</span></b></div>
                <div><span>میانگین روز تا پرداخت</span><b className="num">{h.avgDaysToPay ?? '—'}</b></div>
                <div><span>قبض دارای بدهی</span><b className="num">{h.unpaidCount}</b></div>
              </div>
              <p className="payer-card__note">
                مبالغ به {CURRENCY}. پرداخت تا <span className="num">{PAYMENT_GRACE_DAYS}</span> روز پس از ثبت قبض «به‌موقع» حساب می‌شود.
                تاریخ پرداخت از نسخه ۱.۲.۰ ثبت می‌شود؛ تسویه‌های قبلی تاریخ ندارند.
              </p>
            </section>

            <div className="history-list">
              {h.entries.map((e) => (
                <button type="button" key={e.billId} className="history-item" onClick={() => onOpenBill(e.billId)}>
                  <ExpenseIcon type={e.expenseType} size={36} />
                  <span className="history-item__main">
                    <span className="history-item__top">
                      <span className="history-item__title">{EXPENSE_TYPES[e.expenseType].label} · {MONTHS[e.month - 1]} <span className="num">{e.year}</span></span>
                      <span className="history-item__amount num">{formatAmount(e.amount)}</span>
                    </span>
                    <span className="history-item__dates">
                      ثبت قبض: <span className="num">{date(e.billCreatedAt)}</span>
                      {e.payments.length <= 1 && (
                        <>{' · '}پرداخت: <span className="num">{e.payments[0] ? (e.payments[0].paidAt ? date(e.payments[0].paidAt) : 'نامشخص') : '—'}</span></>
                      )}
                    </span>
                    {(e.payments.length > 1 || (e.paid > 0 && e.remaining > 0)) && (
                      <span className="history-item__payments">
                        {e.payments.map((p, k) => (
                          <span key={k} className="history-pay">
                            <span className="num">{p.paidAt ? date(p.paidAt) : 'نامشخص'}</span>: <span className="num">{formatAmount(p.amount)}</span>
                          </span>
                        ))}
                        {e.remaining > 0 && <span className="history-pay is-due">مانده: <span className="num">{formatAmount(e.remaining)}</span></span>}
                      </span>
                    )}
                    <span className="history-item__foot">
                      <StatusBadge e={e} />
                      {e.days !== null && e.status !== 'unpaid' && (
                        <span className="history-item__days"><span className="num">{e.days}</span> روز پس از ثبت</span>
                      )}
                      {e.status === 'unpaid' && e.days !== null && (
                        <span className="history-item__days"><span className="num">{e.days}</span> روز از ثبت گذشته</span>
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {batches.length > 0 && (
              <section className="up-card up-batches" aria-label="پرداخت‌های بدهی واحد">
                <div className="up-h" style={{ margin: '10px 0 2px' }}><span>پرداخت‌های ثبت‌شده با «پرداخت»</span></div>
                {batches.map((b) => (
                  <div key={b.batchId} className="up-batch">
                    <span className="up-batch__main">
                      <b><span className="num">{formatAmount(b.total)}</span> {CURRENCY}</b>
                      <small>{b.paidAt ? <span className="num">{date(b.paidAt)}</span> : 'نامشخص'} · <span className="num">{b.billCount}</span> قبض</small>
                    </span>
                    <button type="button" className="up-undo" onClick={() => void cancelBatch(b.batchId, b.total)}>لغو این پرداخت</button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

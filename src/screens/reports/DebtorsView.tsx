import { useMemo, useState } from 'react';
import type { BillWithUnits } from '../../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS } from '../../models/constants';
import { ExpenseIcon } from '../../components/ExpenseIcon';
import { IconCheck, IconChevronLeft, IconUser } from '../../components/Icons';
import { formatAmount } from '../../logic/formatting';
import { debtorsReport, PAYMENT_GRACE_DAYS } from '../../logic/debts';

interface Props {
  all: BillWithUnits[] | null;
  onOpenBill: (billId: string) => void;
  onOpenUnit: (unitNumber: number) => void;
}

/** گزارش بدهکاران: واحدهای دارای بدهی، جمع بدهی هر واحد و ریز آن به تفکیک قبض/سال/ماه */
export function DebtorsView({ all, onOpenBill, onOpenUnit }: Props) {
  const report = useMemo(() => debtorsReport(all ?? []), [all]);
  const [open, setOpen] = useState<number | null>(null);
  if (!all) return null;
  const expanded = open ?? report.units[0]?.unitNumber ?? null;

  return (
    <>
      {report.units.length === 0 ? (
        <div className="empty-state">
          <IconCheck size={40} />
          <p>{all.length === 0 ? 'هنوز قبضی ثبت نشده است.' : 'هیچ واحدی بدهی ندارد؛ همه قبض‌ها تسویه شده‌اند.'}</p>
        </div>
      ) : (
        <>
          <section className="report-total report-total--debt" aria-label="جمع بدهی‌ها">
            <div className="report-total__label">جمع بدهی همه واحدها</div>
            <div className="report-total__amount">
              <b className="num">{formatAmount(report.grandTotal)}</b> <span>{CURRENCY}</span>
            </div>
            <div className="report-total__meta">
              <span><span className="num">{report.units.length}</span> واحد بدهکار</span>
              <span className="report-total__dot" aria-hidden="true" />
              <span><span className="num">{report.openBills}</span> قبض تسویه‌نشده</span>
            </div>
          </section>

          <h2 className="report-heading">واحدهای بدهکار</h2>
          <div className="debtor-list">
            {report.units.map((d) => {
              const isOpen = expanded === d.unitNumber;
              const oldest = Math.max(...d.items.map((i) => i.daysOutstanding));
              return (
                <div key={d.unitNumber} className={'debtor' + (isOpen ? ' is-open' : '')}>
                  <button
                    type="button"
                    className="debtor__head"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? -1 : d.unitNumber)}
                  >
                    <span className="unit-avatar unit-avatar--debt"><IconUser size={18} /></span>
                    <span className="debtor__main">
                      <span className="debtor__title">واحد <span className="num">{d.unitNumber}</span></span>
                      <span className="debtor__sub">
                        <span className="num">{d.items.length}</span> قبض تسویه‌نشده
                        {oldest > PAYMENT_GRACE_DAYS && <> · قدیمی‌ترین: <span className="num">{oldest}</span> روز</>}
                      </span>
                    </span>
                    <span className="debtor__amount"><b className="num">{formatAmount(d.total)}</b> {CURRENCY}</span>
                    <IconChevronLeft size={16} className="debtor__chev" />
                  </button>
                  {isOpen && (
                    <div className="debtor__body">
                      {d.items.map((it) => (
                        <button type="button" key={it.billId} className="debt-item" onClick={() => onOpenBill(it.billId)}>
                          <ExpenseIcon type={it.expenseType} size={32} />
                          <span className="debt-item__main">
                            <span className="debt-item__title">{EXPENSE_TYPES[it.expenseType].label}</span>
                            <span className="debt-item__period">
                              {MONTHS[it.month - 1]} <span className="num">{it.year}</span>
                              {' · '}<span className={it.daysOutstanding > PAYMENT_GRACE_DAYS ? 'is-late' : ''}><span className="num">{it.daysOutstanding}</span> روز از ثبت</span>
                            </span>
                            {it.paid > 0 && (
                              <span className="debt-item__partial">
                                پرداخت جزئی <span className="num">{formatAmount(it.paid)}</span> از <span className="num">{formatAmount(it.share)}</span>
                              </span>
                            )}
                          </span>
                          <span className="debt-item__amount num">{formatAmount(it.amount)}</span>
                        </button>
                      ))}
                      <button type="button" className="btn btn--soft btn--block debtor__history" onClick={() => onOpenUnit(d.unitNumber)}>
                        سابقه پرداخت واحد <span className="num">{d.unitNumber}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {report.allUnitNumbers.length > 0 && (
        <>
          <h2 className="report-heading">سابقه پرداخت واحدها</h2>
          <div className="card report-card unit-chips">
            <p className="report-note">برای دیدن تاریخ پرداخت هر قبض، تأخیرها و خوش‌حسابی، واحد را انتخاب کنید.</p>
            <div className="unit-chips__list">
              {report.allUnitNumbers.map((n) => (
                <button type="button" key={n} className="unit-chip" onClick={() => onOpenUnit(n)}>
                  واحد <span className="num">{n}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

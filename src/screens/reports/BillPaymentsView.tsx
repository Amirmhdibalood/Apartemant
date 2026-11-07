import { useMemo, useState } from 'react';
import type { BillWithUnits, ExpenseType } from '../../models/types';
import { CURRENCY, monthName } from '../../models/constants';
import { MultiOptionPicker } from '../../components/MultiOptionPicker';
import { usePeriods } from '../../hooks/usePeriods';
import { ExpenseIcon } from '../../components/ExpenseIcon';
import { IconCalendar, IconCheck, IconChevronLeft, IconX } from '../../components/Icons';
import { formatAmount, toPersianDigits } from '../../logic/formatting';
import { pickReportYear } from '../../logic/report';
import { typeFilterOptions } from '../../logic/entryPrefs';
import { useEntryPrefs } from '../../context/EntryPrefsContext';
import { billPaymentReport, filterPaymentRows, PAYMENT_STATUS_LABEL, toggleStatusFilter, type PaymentStatusFilter } from '../../logic/billPaymentReport';
import { formatJalaliSlash, todayJalali } from '../../logic/jalali';
import { billPaymentsDoc } from '../../logic/reportDoc';
import { ReportActions } from '../../components/ReportActions';
import { typeInfo } from '../../logic/billTypes';

interface Props {
  all: BillWithUnits[] | null;
  year?: number;
  type?: ExpenseType | null;
  onChange: (year: number, type: ExpenseType | null) => void;
  onOpenBill: (billId: string) => void;
}

/** گزارش «پرداخت قبض‌ها»: مهلت پرداخت، تاریخ پرداخت و به‌موقع/با تأخیر بودن پرداخت خودِ قبض‌ها */
export function BillPaymentsView({ all, year: yearProp, type = null, onChange, onOpenBill }: Props) {
  const { visibleYears } = usePeriods();
  const { prefs } = useEntryPrefs();
  const typeOptions = typeFilterOptions(prefs).filter((o) => o.value !== null) as { value: ExpenseType; label: string }[];
  const [status, setStatus] = useState<PaymentStatusFilter>('all');
  const today = todayJalali();
  const billYears = useMemo(() => Array.from(new Set((all ?? []).map((b) => b.bill.year))), [all]);
  const years = visibleYears.length ? visibleYears : [today.year];
  const initialYear = yearProp && years.includes(yearProp) ? yearProp : pickReportYear(years, billYears.filter((y) => years.includes(y)), today.year);
  // ۱.۹: سال و نوع چندتایی؛ خالی = همه (سال پنهان نمی‌آید)
  const [yearSel, setYearSel] = useState<number[] | null>(null);
  const [typeSel, setTypeSel] = useState<ExpenseType[] | null>(null);
  const selYears = (yearSel ?? [initialYear]).filter((y) => years.includes(y));
  const selTypes = (typeSel ?? (type ? [type] : [])).filter((t) => prefs.types.includes(t));
  const year = selYears.length ? selYears : years;
  void onChange;
  const report = useMemo(() => billPaymentReport(all ?? [], year, selTypes, today), [all, year.join(), selTypes.join(), today.year, today.month, today.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = report.summary;
  const shown = useMemo(() => filterPaymentRows(report.rows, status), [report.rows, status]);
  const doc = useMemo(() => (all && report.rows.length > 0 ? billPaymentsDoc(shown, s, selYears, selTypes) : null), [all, report.rows.length, shown, s, selYears.join(), selTypes.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (x: PaymentStatusFilter) => setStatus((cur) => toggleStatusFilter(cur, x));

  return (
    <>
      <div className="filters">
        <MultiOptionPicker id="bp-year" label="سال" unit="سال" value={selYears} options={[...years].reverse().map((y) => ({ value: y, label: String(y) }))} onChange={(v) => setYearSel(v)} />
        <MultiOptionPicker id="bp-type" label="نوع هزینه" unit="نوع" value={selTypes} options={typeOptions} onChange={(v) => setTypeSel(v)} />
      </div>

      {all && report.rows.length === 0 && (
        <div className="empty-state">
          <IconCalendar size={40} />
          <p>
            برای {selYears.length ? `سال ${selYears.map((y) => toPersianDigits(y)).join('، ')}` : 'سال‌های انتخاب‌شده'}{selTypes.length ? ` و قبض ${selTypes.map((t) => `«${typeInfo(t).label}»`).join('، ')}` : ''} هنوز قبضی ثبت نشده است.
            برای بهره‌گیری کامل از این گزارش، هنگام ثبت قبض «مهلت پرداخت» را تعیین کنید و پس از پرداخت، تیک «پرداخت شد» را بزنید.
          </p>
        </div>
      )}

      {all && report.rows.length > 0 && (
        <>
          <div className="bp-statusbar">
            <span className="bp-statusbar__k">وضعیت</span>
            <button type="button" className={'bp-all' + (status === 'all' ? ' is-active' : '')} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>
              {status === 'all' && <IconCheck size={14} />} همه <span className="num">({toPersianDigits(s.total)})</span>
            </button>
            <button type="button" className={'bp-all' + (status === 'paid' ? ' is-active' : '')} aria-pressed={status === 'paid'} onClick={() => tap('paid')}>
              {status === 'paid' && <IconCheck size={14} />} پرداخت‌شده <span className="num">({toPersianDigits(s.paid)})</span>
            </button>
            <span className="bp-statusbar__hint">برای فیلتر، روی یک کارت بزنید</span>
          </div>
          <section className={'bp-summary' + (status !== 'all' ? ' has-filter' : '')} aria-label="خلاصه پرداخت قبض‌ها">
            <button type="button" className={'bp-summary__item is-ontime' + (status === 'onTime' ? ' is-selected' : '')} aria-pressed={status === 'onTime'} onClick={() => tap('onTime')}>
              <b className="num">{s.onTime}</b>
              <span>به‌موقع</span>
              <small>زودتر <span className="num">{s.early}</span> · سر موعد <span className="num">{s.exact}</span>{s.paidNoDue > 0 && <> · بدون مهلت <span className="num">{s.paidNoDue}</span></>}</small>
              {status === 'onTime' && <i className="bp-tick"><IconCheck size={12} /></i>}
            </button>
            <button type="button" className={'bp-summary__item is-late' + (status === 'late' ? ' is-selected' : '')} aria-pressed={status === 'late'} onClick={() => tap('late')}>
              <b className="num">{s.late}</b>
              <span>با تأخیر</span>
              <small>{s.avgLateDays !== null ? <>میانگین <span className="num">{s.avgLateDays}</span> روز</> : '—'}</small>
              {status === 'late' && <i className="bp-tick"><IconCheck size={12} /></i>}
            </button>
            <button type="button" className={'bp-summary__item is-unpaid' + (status === 'unpaid' ? ' is-selected' : '')} aria-pressed={status === 'unpaid'} onClick={() => tap('unpaid')}>
              <b className="num">{s.unpaid}</b>
              <span>پرداخت‌نشده</span>
              <small>گذشته از مهلت <span className="num">{s.overdue}</span> · بدون مهلت <span className="num">{s.unpaidNoDue}</span></small>
              {status === 'unpaid' && <i className="bp-tick"><IconCheck size={12} /></i>}
            </button>
          </section>

          <div className="bp-result" aria-live="polite">
            <span>
              {status === 'all'
                ? <>همه قبض‌ها · <b className="num">{toPersianDigits(shown.length)}</b></>
                : <>فیلتر: <b>{PAYMENT_STATUS_LABEL[status]}</b> · <b className="num">{toPersianDigits(shown.length)}</b> قبض</>}
            </span>
            {status !== 'all' && (
              <button type="button" className="bp-result__clear" onClick={() => setStatus('all')}><IconX size={13} /> نمایش همه</button>
            )}
          </div>

          <div className="bp-list">
            {shown.map((r) => (
              <button type="button" key={r.bill.id} className="bp-row" onClick={() => onOpenBill(r.bill.id)}>
                <ExpenseIcon type={r.bill.expenseType} size={38} />
                <div className="bp-row__main">
                  <div className="bp-row__title">
                    {typeInfo(r.bill.expenseType).label} — {monthName(r.bill.month)}
                    <span className="bp-row__amount"><span className="num">{formatAmount(r.bill.totalAmount)}</span> {CURRENCY}</span>
                  </div>
                  <div className="bp-row__dates">
                    <span>مهلت: <b className="num">{r.dueDate ? formatJalaliSlash(r.dueDate) : '—'}</b></span>
                    <span>پرداخت: <b className="num">{r.paidDate ? formatJalaliSlash(r.paidDate) : '—'}</b></span>
                  </div>
                  <span className={'timing-chip is-' + r.timing}>{r.label}</span>
                </div>
                <IconChevronLeft size={16} className="bp-row__arrow" />
              </button>
            ))}
          </div>
        </>
      )}
      <ReportActions doc={doc} />
    </>
  );
}

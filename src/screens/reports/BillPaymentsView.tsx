import { useMemo } from 'react';
import type { BillWithUnits, ExpenseType } from '../../models/types';
import { CURRENCY, EXPENSE_TYPES, monthName } from '../../models/constants';
import { SelectField } from '../../components/SelectField';
import { ExpenseIcon } from '../../components/ExpenseIcon';
import { IconCalendar, IconChevronLeft } from '../../components/Icons';
import { useSettings } from '../../context/SettingsContext';
import { formatAmount } from '../../logic/formatting';
import { recordYearOptions } from '../../logic/years';
import { pickReportYear } from '../../logic/report';
import { TYPE_FILTER_OPTIONS } from '../../logic/billFilter';
import { billPaymentReport } from '../../logic/billPaymentReport';
import { formatJalaliSlash, todayJalali } from '../../logic/jalali';

interface Props {
  all: BillWithUnits[] | null;
  year?: number;
  type?: ExpenseType | null;
  onChange: (year: number, type: ExpenseType | null) => void;
  onOpenBill: (billId: string) => void;
}

/** گزارش «پرداخت قبض‌ها»: مهلت پرداخت، تاریخ پرداخت و به‌موقع/با تأخیر بودن پرداخت خودِ قبض‌ها */
export function BillPaymentsView({ all, year: yearProp, type = null, onChange, onOpenBill }: Props) {
  const { settings } = useSettings();
  const today = todayJalali();
  const billYears = useMemo(() => Array.from(new Set((all ?? []).map((b) => b.bill.year))), [all]);
  const years = recordYearOptions(settings.activeYears, billYears);
  const year = yearProp && years.includes(yearProp) ? yearProp : pickReportYear(years, billYears, today.year);
  const report = useMemo(() => billPaymentReport(all ?? [], year, type, today), [all, year, type, today.year, today.month, today.day]);
  const s = report.summary;
  const typeIndex = Math.max(0, TYPE_FILTER_OPTIONS.findIndex((o) => o.value === type));

  return (
    <>
      <div className="filters">
        <SelectField id="bp-year" label="سال" value={year} options={years.map((y) => ({ value: y, label: String(y) }))} onChange={(y) => onChange(y, type)} />
        <SelectField
          id="bp-type"
          label="نوع هزینه"
          value={typeIndex}
          options={TYPE_FILTER_OPTIONS.map((o, i) => ({ value: i, label: o.label }))}
          onChange={(i) => onChange(year, TYPE_FILTER_OPTIONS[i]?.value ?? null)}
        />
      </div>

      {all && report.rows.length === 0 && (
        <div className="empty-state">
          <IconCalendar size={40} />
          <p>
            برای سال {year}{type ? ` و قبض «${EXPENSE_TYPES[type].label}»` : ''} قبضی با مهلت پرداخت یا پرداخت‌شده پیدا نشد.
            برای استفاده از این گزارش، هنگام ثبت قبض «مهلت پرداخت» را تعیین کنید و پس از پرداخت، تیک «پرداخت شد» را بزنید.
          </p>
        </div>
      )}

      {all && report.rows.length > 0 && (
        <>
          <section className="bp-summary" aria-label="خلاصه پرداخت قبض‌ها">
            <div className="bp-summary__item is-ontime">
              <b className="num">{s.onTime}</b>
              <span>به‌موقع</span>
              <small>زودتر <span className="num">{s.early}</span> · سر موعد <span className="num">{s.exact}</span></small>
            </div>
            <div className="bp-summary__item is-late">
              <b className="num">{s.late}</b>
              <span>با تأخیر</span>
              <small>{s.avgLateDays !== null ? <>میانگین <span className="num">{s.avgLateDays}</span> روز</> : '—'}</small>
            </div>
            <div className="bp-summary__item is-unpaid">
              <b className="num">{s.unpaid}</b>
              <span>پرداخت‌نشده</span>
              <small>گذشته از مهلت <span className="num">{s.overdue}</span></small>
            </div>
          </section>

          <div className="bp-list">
            {report.rows.map((r) => (
              <button type="button" key={r.bill.id} className="bp-row" onClick={() => onOpenBill(r.bill.id)}>
                <ExpenseIcon type={r.bill.expenseType} size={38} />
                <div className="bp-row__main">
                  <div className="bp-row__title">
                    {EXPENSE_TYPES[r.bill.expenseType].label} — {monthName(r.bill.month)}
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
    </>
  );
}

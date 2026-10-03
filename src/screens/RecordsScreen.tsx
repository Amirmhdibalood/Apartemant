import { useEffect, useMemo, useState } from 'react';
import type { BillWithUnits, ExpenseType } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, monthName } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { SelectField } from '../components/SelectField';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { IconCalendar, IconCheck, IconChevronLeft } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';
import { billRepository } from '../storage/billRepository';
import { currentJalali, pickDefaultYear } from '../logic/date';
import { formatAmount } from '../logic/formatting';
import { settledCount } from '../logic/settlement';
import { recordYearOptions } from '../logic/years';
import { isBillDeleted } from '../logic/billPaid';
import {
  MONTH_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, TYPE_FILTER_OPTIONS, emptyMessage, filterBills, hasActiveFilters,
  normalizeMonth, normalizeStatus, normalizeType, summarizeBills, type RecordsFilter, type StatusFilter,
} from '../logic/billFilter';
import { TONE_LEGEND, billTone, dueText, toneLabel } from '../logic/billStatus';
import { todayJalali } from '../logic/jalali';

interface Props {
  year?: number;
  /** ۱..۱۲؛ نبودن/null = همه ماه‌ها (پیش‌فرض) */
  month?: number | null;
  /** نوع هزینه؛ نبودن/null = همه انواع (پیش‌فرض) */
  type?: ExpenseType | null;
  /** وضعیت؛ پیش‌فرض «همه» (پرداخت‌شده + پرداخت‌نشده، بدون حذف‌شده‌ها) */
  status?: StatusFilter;
  onFilterChange: (filter: RecordsFilter) => void;
  onOpenBill: (billId: string) => void;
  onHelp?: () => void;
  /** وقتی از صفحه گزارش باز شده باشد: بازگشت به گزارش */
  onBack?: () => void;
}

/** ۸. سوابق: فیلتر سال + ماه + نوع هزینه + وضعیت (پیش‌فرض «همه») + کارت‌های رنگی قبض‌ها (از دیتابیس محلی) */
export function RecordsScreen({ year: yearProp, month: monthProp, type: typeProp, status: statusProp, onFilterChange, onOpenBill, onBack, onHelp }: Props) {
  const { settings } = useSettings();
  const now = currentJalali();
  const [all, setAll] = useState<BillWithUnits[] | null>(null);
  useEffect(() => {
    let alive = true;
    billRepository.getAllWithDeleted().then((r) => { if (alive) setAll(r); });
    return () => { alive = false; };
  }, []);

  // سال‌های فعال + سال‌هایی که قبض ذخیره‌شده دارند (قبض‌های سال‌های قدیمی‌تر همچنان دیده می‌شوند)
  const years = recordYearOptions(settings.activeYears, (all ?? []).filter((x) => !isBillDeleted(x.bill) || statusProp === 'deleted').map((x) => x.bill.year));
  const year = yearProp && years.includes(yearProp) ? yearProp : pickDefaultYear(settings.activeYears, now.year);
  const filter: RecordsFilter = { year, month: normalizeMonth(monthProp), type: normalizeType(typeProp), status: normalizeStatus(statusProp) };
  const items = useMemo(() => (all ? filterBills(all, filter) : null), [all, filter.year, filter.month, filter.type, filter.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayJalali();
  const statusIndex = Math.max(0, STATUS_FILTER_OPTIONS.findIndex((o) => o.value === filter.status));
  const summary = items ? summarizeBills(items) : null;
  const typeIndex = Math.max(0, TYPE_FILTER_OPTIONS.findIndex((o) => o.value === filter.type));

  return (
    <>
      <AppHeader title="سوابق" onBack={onBack} onHelp={onHelp} start={<span className="header-icon"><IconCalendar size={24} /></span>} />
      <main className="screen screen--records">
        <div className="filters">
          <SelectField
            id="rec-year"
            label="سال"
            value={year}
            options={years.map((y) => ({ value: y, label: String(y) }))}
            onChange={(y) => onFilterChange({ ...filter, year: y })}
          />
          <SelectField
            id="rec-month"
            label="ماه"
            value={filter.month ?? 0}
            options={MONTH_FILTER_OPTIONS.map((o) => ({ value: o.value ?? 0, label: o.label }))}
            onChange={(m) => onFilterChange({ ...filter, month: normalizeMonth(m) })}
          />
        </div>
        <div className="filters filters--type">
          <SelectField
            id="rec-type"
            label="نوع هزینه"
            value={typeIndex}
            options={TYPE_FILTER_OPTIONS.map((o, i) => ({ value: i, label: o.label }))}
            onChange={(i) => onFilterChange({ ...filter, type: TYPE_FILTER_OPTIONS[i]?.value ?? null })}
          />
          <SelectField
            id="rec-status"
            label="وضعیت"
            value={statusIndex}
            options={STATUS_FILTER_OPTIONS.map((o, i) => ({ value: i, label: o.label }))}
            onChange={(i) => onFilterChange({ ...filter, status: STATUS_FILTER_OPTIONS[i]?.value ?? 'all' })}
          />
        </div>

        {filter.status === 'deleted' ? (
          <p className="records-note">قبض‌های حذف‌شده در هیچ گزارش و محاسبه‌ای حساب نمی‌شوند؛ برای بازگردانی، قبض را باز کنید.</p>
        ) : (
          <div className="tone-legend" aria-label="راهنمای رنگ‌ها">
            {TONE_LEGEND.map((t) => (
              <span key={t.tone} className="tone-legend__item"><span className={`tone-dot tone-${t.tone}`} />{t.label}</span>
            ))}
          </div>
        )}

        {summary && summary.count > 0 && (
          <div className="records-summary" aria-live="polite">
            <span><b className="num">{summary.count}</b> قبض</span>
            <span className="records-summary__sep">•</span>
            <span>جمع: <b className="num">{formatAmount(summary.total)}</b> {CURRENCY}</span>
            <span className="records-summary__sep">•</span>
            <span><b className="num">{summary.paid}</b> پرداخت‌شده</span>
          </div>
        )}

        {items && items.length === 0 && (
          <div className="empty-state">
            <IconCalendar size={40} />
            <p>{emptyMessage(filter)}</p>
            {hasActiveFilters(filter) && (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => onFilterChange({ year, month: null, type: null, status: 'all' })}>
                نمایش همه قبض‌های {year}
              </button>
            )}
          </div>
        )}

        <div className="record-list">
          {items?.map(({ bill, units }) => {
            const info = EXPENSE_TYPES[bill.expenseType];
            const settled = settledCount(units);
            const tone = billTone(bill, today);
            const due = tone === 'unpaid' || tone === 'due' ? dueText(bill, today) : null;
            return (
              <button type="button" key={bill.id} className={`record-card tone-${tone}`} onClick={() => onOpenBill(bill.id)}>
                <div className="record-card__main">
                  <div className="record-card__title">
                    <span>{info.label}</span>
                    {filter.month === null && <span className="record-card__period">{monthName(bill.month)}</span>}
                  </div>
                  <div className="record-card__amount">
                    مبلغ قبض: <b className="num">{formatAmount(bill.totalAmount)}</b> {CURRENCY}
                  </div>
                  <div className="record-card__badges">
                    <span className={`bill-paid-badge tone-${tone}`}>
                      {tone === 'paid' && <IconCheck size={13} strokeWidth={3} />}
                      {tone === 'due' ? 'پرداخت نشده' : toneLabel(tone)}
                    </span>
                    {due && <span className={'due-chip' + (tone === 'due' ? ' is-due' : '')}>{due}</span>}
                  </div>
                  {!bill.isFullySettled && settled > 0 && (
                    <div className="record-card__progress">
                      <span className="num">{settled}</span> از <span className="num">{units.length}</span> واحد تسویه شده
                    </div>
                  )}
                </div>
                <div className="record-card__side">
                  <ExpenseIcon type={bill.expenseType} size={46} />
                  <span className={'status-text' + (bill.isFullySettled ? ' is-settled' : '')}>
                    {bill.isFullySettled ? 'تسویه شده' : 'ثبت شده'}
                  </span>
                </div>
                <IconChevronLeft size={18} className="record-card__arrow" />
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}

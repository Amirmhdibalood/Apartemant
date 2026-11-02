import { occupiedCount } from '../logic/vacant';
import { useEffect, useMemo, useState } from 'react';
import type { BillWithUnits, ExpenseType } from '../models/types';
import { CURRENCY, MONTHS, monthName } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { MultiOptionPicker, type MultiOption } from '../components/MultiOptionPicker';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { IconCalendar, IconCheck, IconChevronLeft, IconLock } from '../components/Icons';
import { useEntryPrefs, useVisibleBills } from '../context/EntryPrefsContext';
import { typeFilterOptions } from '../logic/entryPrefs';
import { billRepository } from '../storage/billRepository';
import { VirtualList } from '../components/VirtualList';
import { currentJalali, pickDefaultYear } from '../logic/date';
import { formatAmount, toPersianDigits } from '../logic/formatting';
import { settledCount } from '../logic/settlement';
import { summarizeBills } from '../logic/billFilter';
import {
  emptyMessageMulti, filterBillsMulti, hasActiveMulti, normalizeMonths, normalizeStatuses, normalizeYears,
  type MultiRecordsFilter, type StatusPick,
} from '../logic/multiFilter';
import { usePeriods } from '../hooks/usePeriods';
import { periodsRepository } from '../storage/periodsRepository';
import { TONE_LEGEND, billTone, dueText, toneLabel } from '../logic/billStatus';
import { todayJalali } from '../logic/jalali';
import { typeInfo } from '../logic/billTypes';

interface Props {
  /** سال‌ها؛ نبودن = سال پیش‌فرض، [] = همهٔ سال‌های نمایان */
  years?: number[];
  /** ماه‌ها؛ نبودن/[] = همه */
  months?: number[];
  /** نوع‌ها؛ نبودن/[] = همه */
  types?: ExpenseType[];
  /** وضعیت‌ها؛ نبودن/[] = پرداخت‌شده + پرداخت‌نشده (بدون حذف‌شده‌ها) */
  statuses?: StatusPick[];
  onFilterChange: (filter: MultiRecordsFilter) => void;
  onOpenBill: (billId: string) => void;
  onSupport?: () => void;
  /** وقتی از صفحه گزارش باز شده باشد: بازگشت به گزارش */
  onBack?: () => void;
}

const STATUS_OPTIONS: MultiOption<StatusPick>[] = [
  { value: 'paid', label: 'پرداخت‌شده' },
  { value: 'unpaid', label: 'پرداخت‌نشده' },
  { value: 'deleted', label: 'حذف‌شده', exclusive: true },
];

/** ۸. سوابق: فیلترهای چندتایی سال + ماه + نوع هزینه + وضعیت (۱.۹) + کارت‌های رنگی قبض‌ها (از دیتابیس محلی) */
export function RecordsScreen({ years: yearsProp, months: monthsProp, types: typesProp, statuses: statusesProp, onFilterChange, onOpenBill, onBack, onSupport }: Props) {
  const now = currentJalali();
  const { prefs } = useEntryPrefs();
  const typeOptions = typeFilterOptions(prefs).filter((o) => o.value !== null) as { value: ExpenseType; label: string }[];
  const [allRaw, setAll] = useState<BillWithUnits[] | null>(null);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const { state, visibleYears } = usePeriods();
  // قبض‌های نوعِ خاموش در سوابق دیده نمی‌شوند (داده پاک نمی‌شود)
  const all = useVisibleBills(allRaw);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void billRepository.getAllWithDeleted().then((r) => { if (alive) setAll(r); });
      void periodsRepository.lockedIds().then((ids) => { if (alive) setLocked(ids); }).catch(() => undefined);
    };
    load();
    const offs = [billRepository.onChange(load), periodsRepository.onChange(load)];
    return () => { alive = false; offs.forEach((o) => o()); };
  }, []);

  const defaultYear = state && state.defaultYear != null && visibleYears.includes(state.defaultYear)
    ? state.defaultYear
    : pickDefaultYear(visibleYears.length ? visibleYears : [now.year], now.year);
  const filter: MultiRecordsFilter = {
    years: yearsProp === undefined ? [defaultYear] : normalizeYears(yearsProp).filter((y) => visibleYears.includes(y)),
    months: normalizeMonths(monthsProp),
    types: (typesProp ?? []).filter((t) => prefs.types.includes(t)),
    statuses: normalizeStatuses(statusesProp),
  };
  const key = JSON.stringify(filter);
  const items = useMemo(() => (all && state ? filterBillsMulti(all, filter, visibleYears) : null), [all, state, key, visibleYears.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayJalali();
  const summary = items ? summarizeBills(items) : null;
  const deletedOnly = filter.statuses.includes('deleted');
  const multiMonth = filter.months.length !== 1;
  const multiYear = filter.years.length !== 1;

  return (
    <>
      <AppHeader title="سوابق" onBack={onBack} onSupport={onSupport} start={<span className="header-icon"><IconCalendar size={24} /></span>} />
      <main className="screen screen--records">
        <div className="filters">
          <MultiOptionPicker
            id="rec-year"
            label="سال"
            unit="سال"
            value={filter.years}
            options={[...visibleYears].reverse().map((y) => ({ value: y, label: String(y) }))}
            onChange={(v) => onFilterChange({ ...filter, years: v })}
          />
          <MultiOptionPicker
            id="rec-month"
            label="ماه"
            unit="ماه"
            value={filter.months}
            options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
            onChange={(v) => onFilterChange({ ...filter, months: v })}
          />
        </div>
        <div className="filters filters--type">
          <MultiOptionPicker
            id="rec-type"
            label="نوع هزینه"
            unit="نوع"
            value={filter.types}
            options={typeOptions}
            onChange={(v) => onFilterChange({ ...filter, types: v })}
          />
          <MultiOptionPicker
            id="rec-status"
            label="وضعیت"
            unit="وضعیت"
            value={filter.statuses}
            options={STATUS_OPTIONS}
            onChange={(v) => onFilterChange({ ...filter, statuses: normalizeStatuses(v) })}
          />
        </div>

        {deletedOnly ? (
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
            <span className="records-summary__sep">•</span>
            <span><b className="num">{summary.unpaid}</b> پرداخت‌نشده</span>
          </div>
        )}

        {items && items.length === 0 && (
          <div className="empty-state">
            <IconCalendar size={40} />
            <p>{emptyMessageMulti(filter)}</p>
            {hasActiveMulti(filter) && (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => onFilterChange({ years: filter.years, months: [], types: [], statuses: [] })}>
                برداشتن فیلترها
              </button>
            )}
          </div>
        )}

        <div className="record-list">
          {items && (
            <VirtualList
              items={items}
              estimateHeight={108}
              keyOf={(row) => row.bill.id}
              renderItem={({ bill, units }) => {
                const info = typeInfo(bill.expenseType);
                const settled = settledCount(units);
                const tone = billTone(bill, today);
                const due = tone === 'unpaid' || tone === 'due' ? dueText(bill, today) : null;
                return (
                  <button type="button" className={`record-card tone-${tone}`} onClick={() => onOpenBill(bill.id)}>
                    <div className="record-card__main">
                      <div className="record-card__title">
                        <span>{info.label}</span>
                        {(multiMonth || multiYear) && (
                          <span className="record-card__period">{monthName(bill.month)}{multiYear ? ` ${toPersianDigits(bill.year)}` : ''}</span>
                        )}
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
                        {locked.has(bill.id) && <span className="lock-chip"><IconLock size={12} /> قفل</span>}
                      </div>
                      {!bill.isFullySettled && settled > 0 && (
                        <div className="record-card__progress">
                          <span className="num">{settled}</span> از <span className="num">{occupiedCount(units)}</span> واحد تسویه شده
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
              }}
            />
          )}
        </div>
      </main>
    </>
  );
}

import { useEffect, useState } from 'react';
import type { BillWithUnits } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { SelectField } from '../components/SelectField';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { IconCalendar, IconChevronLeft } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';
import { billRepository } from '../storage/billRepository';
import { currentJalali, pickDefaultYear } from '../logic/date';
import { formatAmount } from '../logic/formatting';
import { settledCount } from '../logic/settlement';
import { recordYearOptions } from '../logic/years';

interface Props {
  year?: number;
  month?: number;
  onFilterChange: (year: number, month: number) => void;
  onOpenBill: (billId: string) => void;
  /** وقتی از صفحه گزارش باز شده باشد: بازگشت به گزارش */
  onBack?: () => void;
}

/** ۸. سوابق: فیلتر سال/ماه + کارت قبض‌ها (از دیتابیس محلی) */
export function RecordsScreen({ year: yearProp, month: monthProp, onFilterChange, onOpenBill, onBack }: Props) {
  const { settings } = useSettings();
  const now = currentJalali();
  // سال‌های فعال + سال‌هایی که قبض ذخیره‌شده دارند (قبض‌های سال‌های قدیمی‌تر همچنان دیده می‌شوند)
  const [billYears, setBillYears] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    billRepository.getAll().then((all) => { if (alive) setBillYears(all.map((b) => b.bill.year)); });
    return () => { alive = false; };
  }, []);
  const years = recordYearOptions(settings.activeYears, billYears);
  const year = yearProp && years.includes(yearProp) ? yearProp : pickDefaultYear(settings.activeYears, now.year);
  const month = monthProp ?? now.month;
  const [items, setItems] = useState<BillWithUnits[] | null>(null);

  useEffect(() => {
    let alive = true;
    billRepository.findByYearMonth(year, month).then((r) => { if (alive) setItems(r); });
    return () => { alive = false; };
  }, [year, month]);

  return (
    <>
      <AppHeader title="سوابق" onBack={onBack} start={<span className="header-icon"><IconCalendar size={24} /></span>} />
      <main className="screen screen--records">
        <div className="filters">
          <SelectField
            id="rec-year"
            label="سال"
            value={year}
            options={years.map((y) => ({ value: y, label: String(y) }))}
            onChange={(y) => onFilterChange(y, month)}
          />
          <SelectField
            id="rec-month"
            label="ماه"
            value={month}
            options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
            onChange={(m) => onFilterChange(year, m)}
          />
        </div>

        {items && items.length === 0 && (
          <div className="empty-state">
            <IconCalendar size={40} />
            <p>برای {MONTHS[month - 1]} {year} هنوز قبضی ثبت نشده است.</p>
          </div>
        )}

        <div className="record-list">
          {items?.map(({ bill, units }) => {
            const info = EXPENSE_TYPES[bill.expenseType];
            const settled = settledCount(units);
            return (
              <button type="button" key={bill.id} className="record-card" onClick={() => onOpenBill(bill.id)}>
                <div className="record-card__main">
                  <div className="record-card__title">{info.label}</div>
                  <div className="record-card__amount">
                    مبلغ قبض: <b className="num">{formatAmount(bill.totalAmount)}</b> {CURRENCY}
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

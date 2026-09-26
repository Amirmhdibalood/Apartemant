import { useEffect, useState } from 'react';
import type { BillWithUnits } from '../models/types';
import type { ReportTab } from '../navigation';
import { AppHeader } from '../components/AppHeader';
import { IconChart } from '../components/Icons';
import { billRepository } from '../storage/billRepository';
import { YearlyReportView } from './reports/YearlyReportView';
import { DebtorsView } from './reports/DebtorsView';

interface Props {
  tab?: ReportTab;
  year?: number;
  onChange: (tab: ReportTab, year?: number) => void;
  onOpenMonth: (year: number, month: number) => void;
  onOpenBill: (billId: string) => void;
  onOpenUnit: (unitNumber: number) => void;
}

/** گزارش‌های قابل افزودن در آینده فقط به این فهرست اضافه می‌شوند */
const TABS: { id: ReportTab; label: string }[] = [
  { id: 'yearly', label: 'هزینه‌های سال' },
  { id: 'debtors', label: 'بدهکاران' },
];

/** مرکز گزارش‌ها: زبانه‌های «هزینه‌های سال» و «بدهکاران» */
export function ReportsScreen({ tab = 'yearly', year, onChange, onOpenMonth, onOpenBill, onOpenUnit }: Props) {
  const [all, setAll] = useState<BillWithUnits[] | null>(null);
  useEffect(() => {
    let alive = true;
    billRepository.getAll().then((r) => { if (alive) setAll(r); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <AppHeader title="گزارش‌ها" start={<span className="header-icon"><IconChart size={24} /></span>} />
      <main className="screen screen--report">
        <div className="seg" role="tablist" aria-label="نوع گزارش">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'seg__btn' + (tab === t.id ? ' is-active' : '')}
              onClick={() => onChange(t.id, year)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'yearly' ? (
          <YearlyReportView all={all} year={year} onYearChange={(y) => onChange('yearly', y)} onOpenMonth={onOpenMonth} />
        ) : (
          <DebtorsView all={all} onOpenBill={onOpenBill} onOpenUnit={onOpenUnit} />
        )}
      </main>
    </>
  );
}

import { useEffect, useState } from 'react';
import type { BillWithUnits, ExpenseType } from '../models/types';
import type { ReportTab } from '../navigation';
import { AppHeader } from '../components/AppHeader';
import { IconChart } from '../components/Icons';
import { useEntryPrefs, useVisibleBills } from '../context/EntryPrefsContext';
import { activeTypeFilter } from '../logic/entryPrefs';
import { billRepository } from '../storage/billRepository';
import { YearlyReportView } from './reports/YearlyReportView';
import { DebtorsView } from './reports/DebtorsView';
import { BillPaymentsView } from './reports/BillPaymentsView';

interface Props {
  tab?: ReportTab;
  year?: number;
  /** فیلتر نوع هزینه گزارش «پرداخت قبض‌ها» */
  type?: ExpenseType | null;
  onChange: (tab: ReportTab, year?: number, type?: ExpenseType | null) => void;
  onOpenMonth: (year: number, month: number) => void;
  onOpenBill: (billId: string) => void;
  onOpenUnit: (unitNumber: number) => void;
  onHelp?: () => void;
}

/** گزارش‌های قابل افزودن در آینده فقط به این فهرست اضافه می‌شوند */
const TABS: { id: ReportTab; label: string }[] = [
  { id: 'yearly', label: 'هزینه‌های سال' },
  { id: 'debtors', label: 'بدهکاران' },
  { id: 'billPayments', label: 'پرداخت قبض‌ها' },
];

/** مرکز گزارش‌ها: زبانه‌های «هزینه‌های سال»، «بدهکاران» و «پرداخت قبض‌ها» */
export function ReportsScreen({ tab = 'yearly', year, type: typeProp, onChange, onOpenMonth, onOpenBill, onOpenUnit, onHelp }: Props) {
  const { prefs } = useEntryPrefs();
  const type = typeProp ? activeTypeFilter(prefs, typeProp) : typeProp;
  const [allRaw, setAll] = useState<BillWithUnits[] | null>(null);
  // قبض‌های نوعِ خاموش از همهٔ گزارش‌ها و جمع‌ها کنار می‌روند (داده پاک نمی‌شود)
  const all = useVisibleBills(allRaw);
  useEffect(() => {
    let alive = true;
    billRepository.getAll().then((r) => { if (alive) setAll(r); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <AppHeader title="گزارش‌ها" onHelp={onHelp} start={<span className="header-icon"><IconChart size={24} /></span>} />
      <main className="screen screen--report">
        <div className="seg seg--3" role="tablist" aria-label="نوع گزارش">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'seg__btn' + (tab === t.id ? ' is-active' : '')}
              onClick={() => onChange(t.id, year, type)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'yearly' && (
          <YearlyReportView all={all} year={year} onYearChange={(y) => onChange('yearly', y)} onOpenMonth={onOpenMonth} />
        )}
        {tab === 'debtors' && <DebtorsView all={all} onOpenBill={onOpenBill} onOpenUnit={onOpenUnit} />}
        {tab === 'billPayments' && (
          <BillPaymentsView all={all} year={year} type={type} onChange={(y, t) => onChange('billPayments', y, t)} onOpenBill={onOpenBill} />
        )}
      </main>
    </>
  );
}

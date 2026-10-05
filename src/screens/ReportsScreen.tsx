import { useEffect, useState } from 'react';
import type { BillWithUnits, ExpenseType } from '../models/types';
import type { ReportTab } from '../navigation';
import { AppHeader } from '../components/AppHeader';
import { IconChart } from '../components/Icons';
import { useEntryPrefs, useVisibleBills } from '../context/EntryPrefsContext';
import { useReportPrefs } from '../context/ReportPrefsContext';
import { activeTypeFilter } from '../logic/entryPrefs';
import { reportInfo, type ReportId } from '../logic/reportCatalog';
import { isReportVisible } from '../logic/reportPrefs';
import { billRepository } from '../storage/billRepository';
import { ReportsHub } from './reports/ReportsHub';
import { YearlyReportView } from './reports/YearlyReportView';
import { DebtorsView } from './reports/DebtorsView';
import { BillPaymentsView } from './reports/BillPaymentsView';
import { MonthlyTotalView } from './reports/MonthlyTotalView';
import { ChartsView } from './reports/ChartsView';

interface Props {
  /** بدون tab = فهرست گزارش‌ها (hub)؛ با tab = صفحهٔ جداگانهٔ همان گزارش (با دکمهٔ بازگشت) */
  tab?: ReportTab;
  year?: number;
  /** فیلتر نوع هزینه گزارش «پرداخت قبض‌ها» */
  type?: ExpenseType | null;
  onChange: (tab: ReportTab, year?: number, type?: ExpenseType | null) => void;
  /** باز کردن صفحهٔ یک گزارش از فهرست */
  onOpenReport: (id: ReportId) => void;
  onBack: () => void;
  onOpenMonth: (year: number, month: number) => void;
  onOpenBill: (billId: string) => void;
  onOpenUnit: (unitNumber: number) => void;
  /** پرداخت بدهی یک واحد (دکمهٔ «پرداخت» در بدهکاران) */
  onPayUnit: (unitNumber: number) => void;
  onSupport?: () => void;
}

/**
 * مرکز گزارش‌ها (از ۱.۷.۰): فهرست گزارش‌ها مثل تنظیمات + صفحهٔ جداگانهٔ هر گزارش.
 * گزارش‌های خاموش‌شده در «تنظیمات ← نمایش گزارش‌ها» در فهرست نمی‌آیند (داده دست‌نخورده می‌ماند).
 */
export function ReportsScreen({ tab, year, type: typeProp, onChange, onOpenReport, onBack, onOpenMonth, onOpenBill, onOpenUnit, onPayUnit, onSupport }: Props) {
  const { prefs } = useEntryPrefs();
  const { prefs: reportPrefs } = useReportPrefs();
  const type = typeProp ? activeTypeFilter(prefs, typeProp) : typeProp;
  const [allRaw, setAll] = useState<BillWithUnits[] | null>(null);
  // قبض‌های نوعِ خاموش از همهٔ گزارش‌ها و جمع‌ها کنار می‌روند (داده پاک نمی‌شود)
  const all = useVisibleBills(allRaw);
  const page = tab && isReportVisible(reportPrefs, tab) ? tab : undefined;

  useEffect(() => {
    if (!page) { setAll(null); return; }
    let alive = true;
    const needsAllYears = page === 'debtors';
    const loader = needsAllYears || year == null
      ? billRepository.getAll()
      : billRepository.getByYear(year);
    void loader.then((r) => { if (alive) setAll(r); });
    return () => { alive = false; };
  }, [page, year]);

  if (!page) {
    return (
      <>
        <AppHeader title="گزارش‌ها" onSupport={onSupport} start={<span className="header-icon"><IconChart size={24} /></span>} />
        <main className="screen screen--report screen--hub">
          <ReportsHub prefs={reportPrefs} onOpen={onOpenReport} />
        </main>
      </>
    );
  }
  return (
    <>
      <AppHeader title={reportInfo(page).title} onBack={onBack} start={<span className="header-icon"><IconChart size={24} /></span>} />
      <main className="screen screen--report" data-report={page}>
        {page === 'yearly' && <YearlyReportView all={all} year={year} onYearChange={(y) => onChange('yearly', y)} onOpenMonth={onOpenMonth} />}
        {page === 'monthly' && <MonthlyTotalView all={all} />}
        {page === 'monthlyDetail' && <MonthlyTotalView all={all} detailed />}
        {page === 'charts' && <ChartsView all={all} />}
        {page === 'debtors' && <DebtorsView all={all} onOpenBill={onOpenBill} onOpenUnit={onOpenUnit} onPayUnit={onPayUnit} />}
        {page === 'billPayments' && (
          <BillPaymentsView all={all} year={year} type={type} onChange={(y, t) => onChange('billPayments', y, t)} onOpenBill={onOpenBill} />
        )}
      </main>
    </>
  );
}

import { useMemo, useState } from 'react';
import type { BillWithUnits } from '../../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS } from '../../models/constants';
import { SelectField } from '../../components/SelectField';
import { ExpenseIcon } from '../../components/ExpenseIcon';
import { IconCalendar, IconCheck } from '../../components/Icons';
import { ReportActions } from '../../components/ReportActions';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useEntryPrefs } from '../../context/EntryPrefsContext';
import { typeBarColor } from '../../logic/typeColor';
import { faAmount } from '../../logic/billImage';
import { toPersianDigits } from '../../logic/formatting';
import { unitLabel } from '../../logic/building';
import { VACANT_LABEL } from '../../logic/vacant';
import { recordYearOptions } from '../../logic/years';
import { pickReportYear } from '../../logic/report';
import { currentJalali } from '../../logic/date';
import { monthlyTotals, monthsWithBills, type MonthlyUnit } from '../../logic/monthlyTotals';
import { monthlyDetailDoc, monthlyDoc } from '../../logic/reportDoc';

const fa = toPersianDigits;

interface Props {
  all: BillWithUnits[] | null;
  /** «با جزئیات»: سهم هر واحد از هر قبض + جمع واحد */
  detailed?: boolean;
}

function StatusChip({ u }: { u: MonthlyUnit }) {
  if (u.status === 'vacant') return <span className="rt-chip is-vacant">{VACANT_LABEL}</span>;
  if (u.status === 'paid') return <span className="rt-chip is-paid"><IconCheck size={12} /> پرداخت‌شده</span>;
  if (u.status === 'partial') return <span className="rt-chip is-unpaid">مانده {faAmount(u.remaining)}</span>;
  return <span className="rt-chip is-unpaid">پرداخت‌نشده</span>;
}

/** «جمع قبض‌های ماه» (و نسخهٔ «با جزئیات»): قابل پرداخت هر واحد از مجموع همهٔ قبض‌های یک ماه */
export function MonthlyTotalView({ all, detailed = false }: Props) {
  const { settings } = useSettings();
  const { prefs } = useEntryPrefs();
  const { theme } = useTheme();
  const now = currentJalali();
  const billYears = useMemo(() => Array.from(new Set((all ?? []).map((b) => b.bill.year))), [all]);
  const years = recordYearOptions(settings.activeYears, billYears);
  const [yearSel, setYearSel] = useState<number | null>(null);
  const [monthSel, setMonthSel] = useState<number | null>(null);
  const year = yearSel && years.includes(yearSel) ? yearSel : pickReportYear(years, billYears, now.year);
  const have = useMemo(() => monthsWithBills(all ?? [], year), [all, year]);
  const month = monthSel ?? (have.length ? have[have.length - 1] : year === now.year ? now.month : 1);
  const t = useMemo(() => monthlyTotals(all ?? [], year, month, prefs.types), [all, year, month, prefs.types]);
  const doc = useMemo(() => (all && t.bills.length > 0 ? (detailed ? monthlyDetailDoc(t) : monthlyDoc(t)) : null), [all, t, detailed]);
  const shareSum = (type: string) => t.byType.find((x) => x.type === type)?.total ?? 0;

  return (
    <>
      <div className="rpt-pair">
        <SelectField id="mt-year" label="سال" value={year} options={years.map((y) => ({ value: y, label: String(y) }))} onChange={(y) => setYearSel(y)} />
        <SelectField id="mt-month" label="ماه" value={month} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} onChange={(m) => setMonthSel(m)} />
      </div>

      {all && t.bills.length === 0 && (
        <div className="empty-state">
          <IconCalendar size={40} />
          <p>برای {MONTHS[month - 1]} {fa(year)} هنوز قبضی ثبت نشده است.</p>
        </div>
      )}

      {all && t.bills.length > 0 && (
        <>
          <section className="report-total" style={{ marginTop: 12 }} aria-label="جمع قبض‌های ماه">
            <div className="report-total__label">جمع قبض‌های {MONTHS[month - 1]} {fa(year)}</div>
            <div className="report-total__amount"><b className="num">{faAmount(t.grandTotal)}</b> <span>{CURRENCY}</span></div>
            <div className="report-total__meta">
              <span>{fa(t.bills.length)} قبض</span><span className="report-total__dot" aria-hidden="true" />
              <span>{fa(t.occupiedCount)} واحد</span>
              {t.vacantCount > 0 && <><span className="report-total__dot" aria-hidden="true" /><span>{fa(t.vacantCount)} {VACANT_LABEL}</span></>}
            </div>
            <div className="share-bar" aria-hidden="true">
              {t.byType.map((x) => <span key={x.type} style={{ width: `${t.billsTotal ? (x.total / t.billsTotal) * 100 : 0}%`, background: typeBarColor(x.type, theme) }} />)}
            </div>
            <div className="report-total__settle">
              <span>پرداخت‌شده: <b className="num is-ok">{faAmount(t.paidTotal)}</b></span>
              <span>مانده: <b className={'num' + (t.remainingTotal > 0 ? ' is-due' : '')}>{faAmount(t.remainingTotal)}</b></span>
            </div>
          </section>
          <div className="rt-types">
            {t.byType.map((x) => (
              <span key={x.type} className="rt-tchip" title={`${EXPENSE_TYPES[x.type].label}: ${faAmount(shareSum(x.type))}`}>
                <ExpenseIcon type={x.type} size={22} />{EXPENSE_TYPES[x.type].label}
              </span>
            ))}
          </div>

          {!detailed && (
            <>
              <h2 className="report-heading">سهم هر واحد</h2>
              <div className="card report-card">
                {t.units.map((u) => (
                  <div key={u.unitNumber} className={'rt-urow' + (u.vacant ? ' is-vacant' : '')} data-unit={u.unitNumber}>
                    <span className="rt-av">{fa(u.unitNumber)}</span>
                    <div className="rt-umain">
                      <div className="rt-uname">{unitLabel(u.unitNumber, u.alias)}</div>
                      <div className="rt-usub">{u.vacant ? 'بدون سهم' : `${fa(u.personCount)} نفر`} <StatusChip u={u} /></div>
                    </div>
                    <div className="rt-amt">
                      {u.vacant ? <><small>&nbsp;</small><b className="is-muted">{VACANT_LABEL}</b></> : <><small>قابل پرداخت</small><b className="num">{faAmount(u.total)}<i>{CURRENCY}</i></b></>}
                    </div>
                  </div>
                ))}
                <div className="rt-total"><span>جمع کل قابل پرداخت</span><b className="num">{faAmount(t.grandTotal)} <i>{CURRENCY}</i></b></div>
              </div>
              <p className="report-note rt-note">جمع سهم هر واحد از همهٔ قبض‌های {MONTHS[month - 1]} {fa(year)}. واحد خالی سهمی ندارد. وضعیت پرداخت هر واحد از ثبت پرداخت‌ها می‌آید.</p>
            </>
          )}

          {detailed && (
            <>
              {t.units.map((u) => (
                <div key={u.unitNumber} className={'card rt-ucard' + (u.vacant ? ' is-vacant' : '')} data-unit={u.unitNumber}>
                  <div className="rt-uhead">
                    <span className="rt-av">{fa(u.unitNumber)}</span>
                    <div className="rt-umain">
                      <div className="rt-uname">{unitLabel(u.unitNumber, u.alias)}</div>
                      <div className="rt-usub">{u.vacant ? 'در این ماه خالی بوده' : `${fa(u.personCount)} نفر`}</div>
                    </div>
                    <StatusChip u={u} />
                  </div>
                  {u.items.map((i) => (
                    <div key={i.billId} className="rt-brow">
                      <ExpenseIcon type={i.expenseType} size={32} />
                      <div className="rt-bname">{EXPENSE_TYPES[i.expenseType].label}</div>
                      <b className="num">{faAmount(i.amount)}</b>
                    </div>
                  ))}
                  {!u.vacant && (
                    <div className="rt-sub"><span>جمع واحد (قابل پرداخت)</span><b className="num">{faAmount(u.total)} <i>{CURRENCY}</i></b></div>
                  )}
                </div>
              ))}
              <div className="card rt-grand"><span>جمع کل قابل پرداخت</span><b className="num">{faAmount(t.grandTotal)} <i>{CURRENCY}</i></b></div>
            </>
          )}
        </>
      )}
      <ReportActions doc={doc} />
    </>
  );
}

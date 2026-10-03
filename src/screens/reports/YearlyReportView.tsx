import { useMemo } from 'react';
import type { BillWithUnits } from '../../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS } from '../../models/constants';
import { SelectField } from '../../components/SelectField';
import { ExpenseIcon } from '../../components/ExpenseIcon';
import { IconChart, IconChevronLeft } from '../../components/Icons';
import { useTheme } from '../../context/ThemeContext';
import { typeBarColor } from '../../logic/typeColor';
import { useSettings } from '../../context/SettingsContext';
import { currentJalali } from '../../logic/date';
import { formatAmount } from '../../logic/formatting';
import { recordYearOptions } from '../../logic/years';
import { pickReportYear, yearlyReport } from '../../logic/report';

interface Props {
  /** همه قبض‌ها (null = در حال بارگذاری) */
  all: BillWithUnits[] | null;
  year?: number;
  onYearChange: (year: number) => void;
  /** باز کردن سوابق همان ماه */
  onOpenMonth: (year: number, month: number) => void;
}

const pct = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(1)}%`;

/** گزارش هزینه‌های سال: جمع هر نوع هزینه، جمع کل، سهم درصدی و ریز ماه‌به‌ماه */
export function YearlyReportView({ all, year: yearProp, onYearChange, onOpenMonth }: Props) {
  const { settings } = useSettings();
  const { theme } = useTheme();
  const now = currentJalali();

  const billYears = useMemo(() => Array.from(new Set((all ?? []).map((b) => b.bill.year))), [all]);
  // سال‌های فعال + سال‌هایی که قبض دارند (مثل صفحه سوابق)
  const years = recordYearOptions(settings.activeYears, billYears);
  const year = yearProp && years.includes(yearProp) ? yearProp : pickReportYear(years, billYears, now.year);
  const report = useMemo(() => yearlyReport(all ?? [], year), [all, year]);
  const withCost = report.byType.filter((t) => t.total > 0);
  const withoutCost = report.byType.filter((t) => t.total === 0);

  return (
    <>
        <SelectField
          id="report-year"
          label="سال"
          value={year}
          options={years.map((y) => ({ value: y, label: String(y) }))}
          onChange={onYearChange}
        />

        {all && report.billCount === 0 && (
          <div className="empty-state">
            <IconChart size={40} />
            <p>برای سال {year} هنوز قبضی ثبت نشده است.</p>
          </div>
        )}

        {all && report.billCount > 0 && (
          <>
            <section className="report-total" aria-label="جمع کل">
              <div className="report-total__label">جمع کل هزینه‌های سال {year}</div>
              <div className="report-total__amount">
                <b className="num">{formatAmount(report.grandTotal)}</b> <span>{CURRENCY}</span>
              </div>
              <div className="report-total__meta">
                <span><span className="num">{report.billCount}</span> قبض</span>
                <span className="report-total__dot" aria-hidden="true" />
                <span>{withCost.length} نوع هزینه</span>
              </div>
              <div className="share-bar" aria-hidden="true">
                {withCost.map((t) => (
                  <span key={t.type} style={{ width: `${t.percent}%`, background: typeBarColor(t.type, theme) }} />
                ))}
              </div>
              <div className="report-total__settle">
                <span>پرداخت‌شده: <b className="num is-ok">{formatAmount(report.settledTotal)}</b></span>
                <span>مانده: <b className={'num' + (report.unsettledTotal > 0 ? ' is-due' : '')}>{formatAmount(report.unsettledTotal)}</b></span>
              </div>
            </section>

            <h2 className="report-heading">به تفکیک نوع هزینه</h2>
            <div className="card report-card">
              {withCost.map((t) => {
                const info = EXPENSE_TYPES[t.type];
                return (
                  <div className="type-row" key={t.type}>
                    <ExpenseIcon type={t.type} size={38} />
                    <div className="type-row__body">
                      <div className="type-row__top">
                        <span className="type-row__label">{info.label}</span>
                        <span className="type-row__amount">
                          <b className="num">{formatAmount(t.total)}</b> {CURRENCY}
                        </span>
                      </div>
                      <div className="type-row__bar">
                        <span style={{ width: `${Math.max(t.percent, 1.5)}%`, background: typeBarColor(t.type, theme) }} />
                      </div>
                      <div className="type-row__meta">
                        <span><span className="num">{t.count}</span> قبض</span>
                        <span className="type-row__pct num" style={{ color: typeBarColor(t.type, theme) }}>{pct(t.percent)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {withoutCost.length > 0 && (
                <div className="type-zero">
                  <span className="type-zero__k">بدون هزینه در این سال:</span>
                  {withoutCost.map((t) => (
                    <span key={t.type} className="type-zero__chip">{EXPENSE_TYPES[t.type].label}</span>
                  ))}
                </div>
              )}
              <div className="type-row type-row--total">
                <span>جمع کل</span>
                <span><b className="num">{formatAmount(report.grandTotal)}</b> {CURRENCY}</span>
              </div>
            </div>

            <h2 className="report-heading">ماه‌به‌ماه</h2>
            <div className="card report-card">
              {report.byMonth.map((m) => {
                const has = m.count > 0;
                const width = report.maxMonthTotal > 0 ? (m.total / report.maxMonthTotal) * 100 : 0;
                return (
                  <button
                    type="button"
                    key={m.month}
                    className={'month-row' + (has ? '' : ' is-empty')}
                    disabled={!has}
                    onClick={() => onOpenMonth(year, m.month)}
                    aria-label={has ? `سوابق ${MONTHS[m.month - 1]} ${year}` : undefined}
                  >
                    <span className="month-row__name">{MONTHS[m.month - 1]}</span>
                    <span className="month-row__bar">
                      {has && (
                        <span className="month-row__fill" style={{ width: `${Math.max(width, 3)}%` }}>
                          {report.byType
                            .filter((t) => m.byType[t.type])
                            .map((t) => (
                              <span
                                key={t.type}
                                style={{ flexGrow: m.byType[t.type], background: typeBarColor(t.type, theme) }}
                              />
                            ))}
                        </span>
                      )}
                    </span>
                    <span className="month-row__amount num">{has ? formatAmount(m.total) : '—'}</span>
                    {has ? <IconChevronLeft size={16} className="month-row__arrow" /> : <span className="month-row__arrow" />}
                  </button>
                );
              })}
              <p className="report-note">مبالغ به {CURRENCY} است. برای دیدن قبض‌های هر ماه، روی آن ماه بزنید.</p>
            </div>
          </>
        )}
    </>
  );
}

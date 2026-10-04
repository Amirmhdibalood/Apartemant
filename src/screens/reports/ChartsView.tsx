import { useMemo, useState } from 'react';
import type { BillWithUnits, ExpenseType } from '../../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS, monthName } from '../../models/constants';
import { SelectField } from '../../components/SelectField';
import { ExpenseIcon } from '../../components/ExpenseIcon';
import { IconBars, IconLine, IconPie, IconChart } from '../../components/Icons';
import { BarLineChart, PieChart } from '../../components/ChartSvg';
import { ReportActions } from '../../components/ReportActions';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useEntryPrefs } from '../../context/EntryPrefsContext';
import { typeBarColor } from '../../logic/typeColor';
import { faAmount } from '../../logic/billImage';
import { toPersianDigits } from '../../logic/formatting';
import { recordYearOptions } from '../../logic/years';
import { pickReportYear } from '../../logic/report';
import { currentJalali } from '../../logic/date';
import { typeFilterOptions } from '../../logic/entryPrefs';
import { monthsWithBills } from '../../logic/monthlyTotals';
import { chartSeries, normalizeRange, typeShares } from '../../logic/chartReport';
import { faPercent, type ChartKind } from '../../logic/chartLayout';
import { chartDoc } from '../../logic/reportDoc';

const fa = toPersianDigits;
const KINDS: { id: ChartKind; label: string; Icon: typeof IconBars }[] = [
  { id: 'bar', label: 'میله‌ای', Icon: IconBars }, { id: 'line', label: 'خطی', Icon: IconLine }, { id: 'pie', label: 'دایره‌ای', Icon: IconPie },
];

/** «گزارش نموداری»: مقایسهٔ مبلغ ماه‌ها (میله‌ای/خطی) و سهم هر نوع (دایره‌ای) با فیلتر سال، نوع قبض و بازهٔ ماه */
export function ChartsView({ all }: { all: BillWithUnits[] | null }) {
  const { settings } = useSettings();
  const { prefs } = useEntryPrefs();
  const { theme } = useTheme();
  const now = currentJalali();
  const typeOptions = typeFilterOptions(prefs);
  const billYears = useMemo(() => Array.from(new Set((all ?? []).map((b) => b.bill.year))), [all]);
  const years = recordYearOptions(settings.activeYears, billYears);
  const [kind, setKind] = useState<ChartKind>('bar');
  const [yearSel, setYearSel] = useState<number | null>(null);
  const [typeIdx, setTypeIdx] = useState(0);
  const [range, setRange] = useState<[number, number] | null>(null);
  const year = yearSel && years.includes(yearSel) ? yearSel : pickReportYear(years, billYears, now.year);
  const have = useMemo(() => monthsWithBills(all ?? [], year), [all, year]);
  const last = have.length ? have[have.length - 1] : year === now.year ? now.month : 12;
  const [from, to] = range ?? normalizeRange(Math.max(1, last - 3), last);
  const type: ExpenseType | null = typeOptions[Math.min(typeIdx, typeOptions.length - 1)]?.value ?? null;
  const series = useMemo(() => chartSeries(all ?? [], year, type, from, to, prefs.types), [all, year, type, from, to, prefs.types]);
  const shares = useMemo(() => typeShares(all ?? [], year, from, to, prefs.types), [all, year, from, to, prefs.types]);
  const hasData = kind === 'pie' ? shares.total > 0 : series.monthsWithData > 0;
  const doc = useMemo(() => (all && hasData ? chartDoc(kind, year, type, series, shares) : null), [all, hasData, kind, year, type, series, shares]);
  const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

  return (
    <>
      <div className="seg seg--3 chart-seg" role="tablist" aria-label="نوع نمودار">
        {KINDS.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={kind === id} className={'seg__btn' + (kind === id ? ' is-active' : '')} onClick={() => setKind(id)}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      <div className="card chart-filters">
        <SelectField id="ch-year" label="سال" value={year} options={years.map((y) => ({ value: y, label: String(y) }))} onChange={(y) => setYearSel(y)} />
        <SelectField id="ch-type" label="نوع قبض" value={kind === 'pie' ? 0 : Math.min(typeIdx, typeOptions.length - 1)} options={(kind === 'pie' ? typeOptions.slice(0, 1) : typeOptions).map((o, i) => ({ value: i, label: o.label === 'همه' ? 'همه انواع' : o.label }))} onChange={(i) => setTypeIdx(i)} />
        <div className="rpt-pair">
          <SelectField id="ch-from" label="از ماه" value={from} options={monthOptions} onChange={(m) => setRange(normalizeRange(m, to))} />
          <SelectField id="ch-to" label="تا ماه" value={to} options={monthOptions} onChange={(m) => setRange(normalizeRange(from, m))} />
        </div>
      </div>

      {all && !hasData && (
        <div className="empty-state">
          <IconChart size={40} />
          <p>برای {monthName(from)} تا {monthName(to)} {fa(year)}{type && kind !== 'pie' ? ` و قبض «${EXPENSE_TYPES[type].label}»` : ''} هنوز قبضی ثبت نشده است.</p>
        </div>
      )}

      {all && hasData && kind !== 'pie' && (
        <>
          <div className="card chart-card">
            <div className="chart-card__head">
              {type ? <ExpenseIcon type={type} size={30} /> : <span className="chart-card__ico"><IconChart size={20} /></span>}
              <b>مبلغ {type ? `قبض ${EXPENSE_TYPES[type].label}` : 'همهٔ قبض‌ها'} در هر ماه</b>
              <span className="chart-card__unit">{CURRENCY}</span>
            </div>
            <BarLineChart series={series} kind={kind} type={type} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat"><small>بیشترین</small><b className="num">{series.max ? faAmount(series.max.total) : '—'}</b><span>{series.max ? monthName(series.max.month) : ''}</span></div>
            <div className="chart-stat"><small>کمترین</small><b className="num">{series.min ? faAmount(series.min.total) : '—'}</b><span>{series.min ? monthName(series.min.month) : ''}</span></div>
            <div className="chart-stat"><small>میانگین ماهانه</small><b className="num">{faAmount(Math.round(series.average))}</b><span>جمع {faAmount(series.total)}</span></div>
          </div>
          <h2 className="report-heading">ماه‌به‌ماه و تغییر نسبت به ماه قبل</h2>
          <div className="card report-card">
            {series.months.map((m) => (
              <div key={m.month} className="chart-mrow">
                <span className="chart-mrow__m">{monthName(m.month)}</span>
                <span className="chart-mrow__v num">{m.count ? faAmount(m.total) : '—'}
                  {m.isMax && <span className="chart-badge is-max">بیشترین</span>}{m.isMin && <span className="chart-badge is-min">کمترین</span>}
                </span>
                {m.delta !== null ? (
                  <span className={'chart-chip ' + (m.delta > 0 ? 'is-up' : m.delta < 0 ? 'is-down' : '')}>
                    {m.delta > 0 ? '▲' : m.delta < 0 ? '▼' : '='} {m.percent === null ? '' : faPercent(m.percent) + ' · '}{m.delta >= 0 ? '+' : '−'}{faAmount(Math.abs(m.delta))}
                  </span>
                ) : <span className="chart-chip">—</span>}
              </div>
            ))}
            <p className="report-note">افزایش هزینه قرمز و کاهش آن سبز نشان داده می‌شود. تغییر فقط بین ماه‌هایی حساب می‌شود که قبض دارند.</p>
          </div>
        </>
      )}

      {all && hasData && kind === 'pie' && (
        <>
          <div className="card chart-card">
            <div className="chart-card__sub">سهم هر نوع قبض از مجموع {monthName(from)} تا {monthName(to)} {fa(year)}</div>
            <PieChart shares={shares.shares} />
            <div className="chart-card__total">جمع دوره: <b className="num">{faAmount(shares.total)}</b> <span>{CURRENCY}</span></div>
          </div>
          <div className="card report-card">
            {shares.shares.map((s) => (
              <div className="type-row" key={s.type}>
                <ExpenseIcon type={s.type} size={38} />
                <div className="type-row__body">
                  <div className="type-row__top"><span className="type-row__label">{EXPENSE_TYPES[s.type].label}</span><span className="type-row__amount"><b className="num">{faAmount(s.total)}</b> {CURRENCY}</span></div>
                  <div className="type-row__bar"><span style={{ width: `${s.percent}%`, background: typeBarColor(s.type, theme) }} /></div>
                  <div className="type-row__meta"><span><span className="num">{fa(s.count)}</span> قبض</span><span className="type-row__pct num" style={{ color: typeBarColor(s.type, theme) }}>{faPercent(s.percent)}</span></div>
                </div>
              </div>
            ))}
            <div className="type-row type-row--total"><span>جمع دوره</span><span><b className="num">{faAmount(shares.total)}</b> {CURRENCY}</span></div>
          </div>
          <p className="report-note">در نمودار دایره‌ای همیشه «همه انواع» حساب می‌شود. انواع قبضِ خاموش در تنظیمات نمایش داده نمی‌شوند.</p>
        </>
      )}
      <ReportActions doc={doc} />
    </>
  );
}

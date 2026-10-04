/**
 * مدل «سند گزارش» (از ۱.۷.۰) — توصیف خالص و قابل تست از محتوای هر گزارش برای خروجی تصویر (PNG/JPEG) و PDF.
 * رسم روی canvas در services/reportImage.tsx انجام می‌شود. همهٔ متن‌ها فارسی و با ارقام فارسی‌اند.
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS, monthName } from '../models/constants';
import { faAmount, APP_NAME_FA } from './billImage';
import { toPersianDigits } from './formatting';
import { unitLabel } from './building';
import { VACANT_LABEL } from './vacant';
import type { YearlyReport } from './report';
import type { DebtorsReport } from './debts';
import { PAYMENT_GRACE_DAYS } from './debts';
import { isPaidTiming, type BillPaymentRow, type BillPaymentSummary } from './billPaymentReport';
import type { MonthlyTotals, MonthlyUnit } from './monthlyTotals';
import type { ChartKind } from './chartLayout';
import { faPercent } from './chartLayout';
import type { ChartSeries, TypeShare } from './chartReport';
import type { ReportId } from './reportCatalog';

const fa = (n: number | string) => toPersianDigits(n);

export type DocTone = 'ok' | 'info' | 'danger' | 'muted' | 'warn';

export interface DocRow {
  label: string;
  sub?: string;
  value: string;
  /** خط ریز زیر مبلغ (مثلاً «از مجموع …») */
  valueSub?: string;
  /** مبلغ سبز (مثلاً «۰» برای واحد تسویه‌شده) */
  valueOk?: boolean;
  /** نوع هزینه → آیکون رنگی کنار ردیف */
  type?: ExpenseType;
  tag?: { text: string; tone: DocTone };
  muted?: boolean;
}

export type DocBlock =
  | { k: 'summary'; label: string; value: string; unit: string; meta: string[]; lines?: { label: string; value: string }[] }
  | { k: 'heading'; text: string }
  | { k: 'rows'; rows: DocRow[]; footer?: { label: string; value: string; note?: string; ok?: boolean } }
  | { k: 'chart'; kind: ChartKind; title: string; series?: ChartSeries; typeColor?: ExpenseType | null; shares?: TypeShare[]; total?: number }
  | { k: 'note'; text: string };

export interface ReportDoc {
  id: ReportId;
  title: string;
  subtitle: string;
  /** نام فایل بدون پسوند (ASCII) */
  fileBase: string;
  blocks: DocBlock[];
}

const period = (y: number, m: number) => `${monthName(m)} ${fa(y)}`;
const money = (n: number) => `${faAmount(n)} ${CURRENCY}`;

export function yearlyDoc(r: YearlyReport): ReportDoc {
  const withCost = r.byType.filter((t) => t.total > 0);
  const blocks: DocBlock[] = [
    { k: 'summary', label: `جمع کل هزینه‌های سال ${fa(r.year)}`, value: faAmount(r.grandTotal), unit: CURRENCY, meta: [`${fa(r.billCount)} قبض`, `${fa(withCost.length)} نوع هزینه`],
      lines: [{ label: 'پرداخت‌شده', value: faAmount(r.settledTotal) }, { label: 'مانده', value: faAmount(r.unsettledTotal) }] },
    { k: 'heading', text: 'به تفکیک نوع هزینه' },
    { k: 'rows', rows: withCost.map((t) => ({ label: EXPENSE_TYPES[t.type].label, sub: `${fa(t.count)} قبض • ${faPercent(t.percent)}`, value: money(t.total), type: t.type })), footer: { label: 'جمع کل', value: money(r.grandTotal) } },
    { k: 'heading', text: 'ماه‌به‌ماه' },
    { k: 'rows', rows: r.byMonth.filter((m) => m.count > 0).map((m) => ({ label: MONTHS[m.month - 1], sub: `${fa(m.count)} قبض`, value: money(m.total) })) },
  ];
  return { id: 'yearly', title: 'هزینه‌های سال', subtitle: `سال ${fa(r.year)}`, fileBase: `yearly-${r.year}`, blocks };
}

export function debtorsDoc(r: DebtorsReport): ReportDoc {
  const blocks: DocBlock[] = [];
  if (r.units.length === 0) {
    blocks.push({ k: 'note', text: 'هیچ واحدی بدهی ندارد؛ همه قبض‌ها تسویه شده‌اند.' });
  } else {
    blocks.push({ k: 'summary', label: 'جمع بدهی همه واحدها', value: faAmount(r.grandTotal), unit: CURRENCY, meta: [`${fa(r.units.length)} واحد بدهکار`, `${fa(r.openBills)} قبض تسویه‌نشده`] });
    for (const d of r.units) {
      blocks.push({ k: 'heading', text: unitLabel(d.unitNumber, d.alias) });
      blocks.push({
        k: 'rows',
        rows: d.items.map((it) => ({
          label: EXPENSE_TYPES[it.expenseType].label, type: it.expenseType, value: faAmount(it.amount),
          sub: `${period(it.year, it.month)} • ${fa(it.daysOutstanding)} روز از ثبت${it.daysOutstanding > PAYMENT_GRACE_DAYS ? ' (دیرکرد)' : ''}${it.paid > 0 ? ` • پرداخت جزئی ${faAmount(it.paid)} از ${faAmount(it.share)}` : ''}`,
        })),
        footer: { label: 'جمع بدهی', value: money(d.total) },
      });
    }
  }
  return { id: 'debtors', title: 'بدهکاران', subtitle: 'مانده بدهی هر واحد', fileBase: 'debtors', blocks };
}

const toneOf = (t: BillPaymentRow['timing']): DocTone => (t === 'late' || t === 'overdue' ? 'danger' : isPaidTiming(t) ? 'ok' : 'info');
const dateText = (d: { year: number; month: number; day: number } | null) => (d ? `${fa(d.year)}/${fa(String(d.month).padStart(2, '0'))}/${fa(String(d.day).padStart(2, '0'))}` : '—');

export function billPaymentsDoc(rows: BillPaymentRow[], s: BillPaymentSummary, year: number, type: ExpenseType | null): ReportDoc {
  const blocks: DocBlock[] = [
    { k: 'summary', label: `پرداخت قبض‌ها — سال ${fa(year)}${type ? ` — ${EXPENSE_TYPES[type].label}` : ''}`, value: fa(s.total), unit: 'قبض',
      meta: [`پرداخت‌شده ${fa(s.paid)}`, `پرداخت‌نشده ${fa(s.unpaid)}`],
      lines: [{ label: 'به‌موقع', value: fa(s.onTime) }, { label: 'با تأخیر', value: fa(s.late) }, { label: 'پرداخت‌نشده', value: fa(s.unpaid) }] },
    { k: 'rows', rows: rows.map((r) => ({
      label: `${EXPENSE_TYPES[r.bill.expenseType].label} ${period(r.bill.year, r.bill.month)}`, type: r.bill.expenseType,
      sub: `مهلت: ${dateText(r.dueDate)} • پرداخت: ${dateText(r.paidDate)}`, value: faAmount(r.bill.totalAmount),
      tag: { text: r.label, tone: toneOf(r.timing) },
    })) },
  ];
  if (rows.length === 0) blocks.push({ k: 'note', text: 'قبضی ثبت نشده است.' });
  return { id: 'billPayments', title: 'پرداخت قبض‌ها', subtitle: `سال ${fa(year)}`, fileBase: `payments-${year}`, blocks };
}

const unitTag = (u: MonthlyUnit): DocRow['tag'] =>
  u.status === 'vacant' ? { text: VACANT_LABEL, tone: 'muted' }
  : u.status === 'paid' ? { text: 'پرداخت‌شده', tone: 'ok' }
  : u.status === 'partial' ? { text: `پرداخت‌شده ${faAmount(u.paid)}`, tone: 'info' }
  : { text: 'پرداخت‌نشده', tone: 'info' };

function monthlySummary(t: MonthlyTotals): DocBlock {
  return {
    k: 'summary', label: `جمع قبض‌های ${period(t.year, t.month)}`, value: faAmount(t.grandTotal), unit: CURRENCY,
    meta: [`${fa(t.bills.length)} قبض`, `${fa(t.occupiedCount)} واحد`, ...(t.vacantCount ? [`${fa(t.vacantCount)} خالی`] : [])],
    lines: [{ label: 'پرداخت‌شده', value: faAmount(t.paidTotal) }, { label: 'قابل پرداخت', value: faAmount(t.remainingTotal) }],
  };
}

export function monthlyDoc(t: MonthlyTotals): ReportDoc {
  const blocks: DocBlock[] = [monthlySummary(t)];
  if (t.units.length === 0) blocks.push({ k: 'note', text: 'برای این ماه قبضی ثبت نشده است.' });
  else {
    blocks.push({ k: 'heading', text: 'سهم هر واحد' });
    blocks.push({
      k: 'rows',
      rows: t.units.map((u) => ({
        label: unitLabel(u.unitNumber, u.alias), sub: u.vacant ? 'بدون سهم' : `${fa(u.personCount)} نفر • قابل پرداخت`,
        value: u.vacant ? VACANT_LABEL : money(u.remaining), valueOk: !u.vacant && u.remaining === 0, valueSub: !u.vacant && u.paid > 0 ? `از مجموع ${faAmount(u.total)}` : undefined, tag: unitTag(u), muted: u.vacant,
      })),
      footer: { label: 'جمع کل قابل پرداخت', value: money(t.remainingTotal), note: t.paidTotal > 0 ? `از مجموع ${faAmount(t.grandTotal)} • پرداخت‌شده ${faAmount(t.paidTotal)}` : undefined },
    });
  }
  return { id: 'monthly', title: 'جمع قبض‌های ماه', subtitle: period(t.year, t.month), fileBase: `monthly-${t.year}-${String(t.month).padStart(2, '0')}`, blocks };
}

export function monthlyDetailDoc(t: MonthlyTotals): ReportDoc {
  const blocks: DocBlock[] = [monthlySummary(t)];
  if (t.units.length === 0) blocks.push({ k: 'note', text: 'برای این ماه قبضی ثبت نشده است.' });
  for (const u of t.units) {
    blocks.push({ k: 'heading', text: `${unitLabel(u.unitNumber, u.alias)}${u.vacant ? '' : ` • ${fa(u.personCount)} نفر`}` });
    if (u.vacant) blocks.push({ k: 'rows', rows: [{ label: VACANT_LABEL, sub: 'در این ماه سهمی ندارد', value: '—', tag: { text: VACANT_LABEL, tone: 'muted' }, muted: true }] });
    else blocks.push({
      k: 'rows',
      rows: u.items.map((i) => ({ label: EXPENSE_TYPES[i.expenseType].label, type: i.expenseType, value: faAmount(i.amount) })),
      footer: { label: 'قابل پرداخت', value: money(u.remaining), note: u.paid > 0 ? `از مجموع ${faAmount(u.total)} • پرداخت‌شده ${faAmount(u.paid)}` : undefined, ok: u.remaining === 0 },
    });
  }
  if (t.units.length) blocks.push({ k: 'rows', rows: [], footer: { label: 'جمع کل قابل پرداخت', value: money(t.remainingTotal), note: t.paidTotal > 0 ? `از مجموع ${faAmount(t.grandTotal)} • پرداخت‌شده ${faAmount(t.paidTotal)}` : undefined } });
  return { id: 'monthlyDetail', title: 'جمع قبض‌های ماه با جزئیات', subtitle: period(t.year, t.month), fileBase: `monthly-detail-${t.year}-${String(t.month).padStart(2, '0')}`, blocks };
}

export function chartDoc(kind: ChartKind, year: number, type: ExpenseType | null, series: ChartSeries, shares: { shares: TypeShare[]; total: number }): ReportDoc {
  const range = `${monthName(series.from)} تا ${monthName(series.to)} ${fa(year)}`;
  const blocks: DocBlock[] = [];
  if (kind === 'pie') {
    blocks.push({ k: 'chart', kind, title: `سهم هر نوع قبض از مجموع ${range}`, shares: shares.shares, total: shares.total });
    blocks.push({ k: 'rows', rows: shares.shares.map((s) => ({ label: EXPENSE_TYPES[s.type].label, type: s.type, sub: `${fa(s.count)} قبض • ${faPercent(s.percent)}`, value: money(s.total) })), footer: { label: 'جمع دوره', value: money(shares.total) } });
  } else {
    blocks.push({ k: 'chart', kind, title: `مبلغ ${type ? `قبض ${EXPENSE_TYPES[type].label}` : 'همهٔ قبض‌ها'} در هر ماه`, series, typeColor: type });
    blocks.push({ k: 'summary', label: `جمع ${range}`, value: faAmount(series.total), unit: CURRENCY, meta: [`میانگین ماهانه ${faAmount(series.average)}`],
      lines: [...(series.max ? [{ label: `بیشترین (${monthName(series.max.month)})`, value: faAmount(series.max.total) }] : []), ...(series.min ? [{ label: `کمترین (${monthName(series.min.month)})`, value: faAmount(series.min.total) }] : [])] });
    blocks.push({ k: 'rows', rows: series.months.map((m) => ({
      label: monthName(m.month), value: m.count ? money(m.total) : '—', muted: !m.count,
      tag: m.isMax ? { text: 'بیشترین', tone: 'danger' } : m.isMin ? { text: 'کمترین', tone: 'ok' } : undefined,
      sub: m.delta === null ? undefined : m.delta === 0 ? 'بدون تغییر نسبت به ماه قبل' : `${m.delta > 0 ? '▲' : '▼'} ${m.percent === null ? '' : faPercent(m.percent) + ' • '}${m.delta >= 0 ? '+' : '−'}${faAmount(Math.abs(m.delta))} نسبت به ماه قبل`,
    })) });
  }
  return { id: 'charts', title: 'گزارش نموداری', subtitle: `${range}${type && kind !== 'pie' ? ` — ${EXPENSE_TYPES[type].label}` : ''}`, fileBase: `chart-${kind}-${year}`, blocks };
}

export const DOC_APP_NAME = APP_NAME_FA;
export type { BillWithUnits };

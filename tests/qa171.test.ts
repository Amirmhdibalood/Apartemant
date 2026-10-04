/**
 * QA کامل ۱.۷.۰ (آزمون‌های سراسری): دادهٔ ساختگی با سناریوهای متنوع از مسیر واقعی برنامه
 * (emptyDraft → validateDraft → calculateBySplit → buildBill) و مقایسهٔ همهٔ گزارش‌ها/جمع‌ها/شمارش‌ها
 * با بازمحاسبهٔ مستقل (BigInt و حلقه‌های ساده روی داده‌های خام).
 */
import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits, ExpenseType, SplitMethod, Unit } from '../src/models/types';
import { EXPENSE_TYPE_ORDER } from '../src/models/constants';
import { calculateBySplit } from '../src/logic/split';
import { areaToMilli } from '../src/logic/area';
import { buildBill, emptyDraft } from '../src/logic/billFactory';
import { validateDraft } from '../src/logic/validation';
import { addPayment, settleFully, paidAmount, remainingAmount } from '../src/logic/payments';
import { yearlyReport } from '../src/logic/report';
import { debtorsReport } from '../src/logic/debts';
import { billPaymentReport } from '../src/logic/billPaymentReport';
import { monthlyTotals, monthsWithBills } from '../src/logic/monthlyTotals';
import { chartSeries, typeShares } from '../src/logic/chartReport';
import { filterBills, summarizeBills } from '../src/logic/billFilter';
import { selectDueAlerts } from '../src/logic/dueAlerts';
import { setBillPaid, softDeleteBill, restoreBill, isBillDeleted, isBillPaid } from '../src/logic/billPaid';
import { visibleBills } from '../src/logic/entryPrefs';
import { monthlyDoc, monthlyDetailDoc, yearlyDoc, debtorsDoc, billPaymentsDoc, chartDoc, type ReportDoc, type DocBlock } from '../src/logic/reportDoc';
import { createBackup, parseBackup, serializeBackup, BACKUP_VERSION } from '../src/logic/backup';
import { sanitizeSettings } from '../src/logic/settings';
import { jalaliToDayNumber, gregorianToJalali, jalaliToGregorian, formatJalaliKey, jalaliMonthLength, isJalaliLeapYear, type JalaliDate } from '../src/logic/jalali';
import { formatAmount, normalizeDigits, onlyDigits, parseAmount, reformatAmountInput, sanitizePersonCount, toPersianDigits } from '../src/logic/formatting';
import { parseArea, parseAreaInput, sanitizeAreaInput } from '../src/logic/area';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: R, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)];
const METHODS: SplitMethod[] = ['perPerson', 'perUnit', 'perArea'];
const TODAY: JalaliDate = { year: 1405, month: 7, day: 12 };
const NOW = new Date('2026-10-04T05:00:00Z');

// ───────── ساخت قبض از مسیر واقعی ─────────
interface Spec {
  year: number; month: number; type: ExpenseType; total: number; method: SplitMethod;
  persons: string[]; vacant: boolean[]; areas: string[]; aliases?: (string | null)[]; due?: string | null;
}
function mk(spec: Spec, id = 0): BillWithUnits {
  const d = { ...emptyDraft(spec.year, spec.month, null), expenseType: spec.type, amountDigits: String(spec.total), personCounts: spec.persons,
    unitVacant: spec.vacant, unitAreas: spec.areas, unitAliases: spec.aliases ?? spec.persons.map(() => null), splitMethod: spec.method, dueDate: spec.due ?? null };
  const v = validateDraft(d);
  if (!v.ok) throw new Error('invalid spec: ' + v.errors.map((e) => e.message).join('|'));
  const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, d.splitMethod, v.value.vacant, v.value.areas);
  const bw = buildBill(d, calc, null, new Date(NOW.getTime() + id * 1000));
  return { bill: { ...bw.bill, id: `b${id}` }, units: bw.units.map((u) => ({ ...u, billId: `b${id}`, id: `b${id}-u${u.unitNumber}` })) };
}

interface Profile { name: string; units: () => number; huge?: boolean; tiny?: boolean; oneLive?: boolean; decimal?: boolean }
const PROFILES: Profile[] = [
  { name: 'one-unit', units: () => 1 },
  { name: 'two-units', units: () => 2 },
  { name: 'many-units', units: () => 60 },
  { name: 'all-vacant-but-one', units: () => 12, oneLive: true },
  { name: 'decimal-area', units: () => 7, decimal: true },
  { name: 'huge-numbers', units: () => 9, huge: true },
  { name: 'odd-rounding', units: () => 7, tiny: true },
  { name: 'typical', units: () => 6 },
];

function genBills(seed: number, pr: Profile, enabledTypes: ExpenseType[] = EXPENSE_TYPE_ORDER): BillWithUnits[] {
  const r = rng(seed);
  const out: BillWithUnits[] = [];
  const nBills = int(r, 6, 24);
  let n = pr.units();
  const baseVacant = Array.from({ length: n }, () => r() < 0.2);
  const keepLive = int(r, 0, n - 1);
  const baseAreas = Array.from({ length: n }, () => pr.decimal ? String(int(r, 1, 300000) / 1000) : String(int(r, 20, 300)));
  const basePersons = Array.from({ length: n }, () => String(int(r, 0, 6)));
  const startYear = pick(r, [1402, 1403, 1404, 1405]);
  for (let k = 0; k < nBills; k++) {
    if (r() < 0.12 && n < 70) { n += 1; baseVacant.push(false); baseAreas.push('55.5'); basePersons.push('3'); } // واحد تازه
    const vacant = baseVacant.slice(0, n).map((v, i) => (pr.oneLive ? i !== keepLive : v));
    if (vacant.every(Boolean)) vacant[keepLive] = false;
    const method = pick(r, METHODS);
    const persons = basePersons.slice(0, n).map((p, i) => (vacant[i] ? p : method === 'perPerson' ? String(Math.max(1, Number(p))) : p));
    const total = pr.huge ? int(r, 2 ** 47 - 5000, 2 ** 47 + 5000) : pr.tiny ? int(r, 1, 30) : int(r, 1, r() < 0.5 ? 9_999_999 : 900_000_000_000);
    const year = startYear + Math.floor((k * 2.4) / 12) + (r() < 0.2 ? 1 : 0);
    const dueY = r() < 0.7 ? { year: TODAY.year, month: TODAY.month, day: int(r, 1, 28) } : null;
    out.push(mk({
      year, month: int(r, 1, 12), type: pick(r, enabledTypes), total, method, persons, vacant,
      areas: baseAreas.slice(0, n), aliases: baseVacant.slice(0, n).map((_, i) => (i % 3 === 0 ? `ساکن ${i + 1}` : null)),
      due: dueY ? formatJalaliKey(dueY) : r() < 0.3 ? formatJalaliKey({ year: 1405, month: int(r, 5, 9), day: int(r, 1, 29) }) : null,
    }, k));
  }
  // پرداخت‌ها / پرداخت قبض / حذف
  return out.map((b, k) => {
    let units: Unit[] = b.units.map((u) => {
      if (u.shareAmount === 0 || r() < 0.35) return u;
      if (r() < 0.5) return settleFully(u, NOW);
      const part = Math.max(1, Math.floor(u.shareAmount * r()));
      return addPayment(u, Math.min(part, u.shareAmount), NOW);
    });
    let bill: Bill = { ...b.bill, isFullySettled: units.every((u) => u.isSettled) };
    if (r() < 0.3) bill = setBillPaid(bill, true, { year: 1405, month: int(r, 6, 7), day: int(r, 1, 28) });
    else if (r() < 0.15) { bill = softDeleteBill(bill, NOW); }
    if (r() < 0.05 && isBillDeleted(bill)) bill = restoreBill(bill);
    void k;
    return { bill, units };
  });
}

const live = (all: BillWithUnits[]) => all.filter((x) => !isBillDeleted(x.bill));
const sumN = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const sumBig = (xs: number[]) => xs.reduce((s, x) => s + BigInt(x), 0n);

// ───────── ۱) تقسیم: صحت با BigInt و همهٔ سناریوها ─────────
describe('QA 1.7.0 — تقسیم در سناریوهای مختلف', () => {
  it('هر سناریو: جمع سهم‌ها = مبلغ؛ خالی = ۰؛ هر سهم بین کف و سقف مقدار دقیق (BigInt)', () => {
    let checked = 0;
    for (const pr of PROFILES) for (let seed = 1; seed <= 25; seed++) {
      for (const x of genBills(seed * 97 + pr.name.length, pr)) {
        const { bill, units } = x;
        expect(sumBig(units.map((u) => u.shareAmount))).toBe(BigInt(bill.totalAmount));
        expect(Number.isSafeInteger(bill.totalAmount)).toBe(true);
        const m = bill.splitMethod;
        const w = units.map((u) => (u.vacant ? 0 : m === 'perUnit' ? 1 : m === 'perArea' ? areaToMilli(u.area ?? 1) : u.personCount));
        const W = w.reduce((s, v) => s + BigInt(v), 0n);
        expect(W > 0n).toBe(true);
        units.forEach((u, i) => {
          expect(u.shareAmount).toBeGreaterThanOrEqual(0);
          expect(Number.isSafeInteger(u.shareAmount)).toBe(true);
          if (u.vacant) { expect(u.shareAmount).toBe(0); return; }
          const exact = BigInt(bill.totalAmount) * BigInt(w[i]);
          const lo = exact / W;
          const hi = exact % W === 0n ? lo : lo + 1n;
          expect(BigInt(u.shareAmount) >= lo && BigInt(u.shareAmount) <= hi).toBe(true);
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });
});

// ───────── ۲) سازگاری گزارش‌ها با دادهٔ خام ─────────
function oracle(all: BillWithUnits[]) {
  const L = live(all);
  const years = [...new Set(L.map((x) => x.bill.year))];
  return { L, years };
}

describe('QA 1.7.0 — سازگاری همهٔ گزارش‌ها با بازمحاسبهٔ مستقل', () => {
  for (const pr of PROFILES) {
    it(`سناریو «${pr.name}»: سالانه، ماهانه، جزئیات، نمودار، بدهکاران، پرداخت قبض‌ها، سوابق، هشدار`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const all = genBills(seed * 131 + 7, pr);
        const { L, years } = oracle(all);
        // سوابق (فهرست)
        const rec = summarizeBills(L);
        expect(rec.count).toBe(L.length);
        expect(rec.total).toBe(sumN(L.map((x) => x.bill.totalAmount)));
        expect(rec.paid + rec.unpaid).toBe(rec.count);
        expect(rec.paid).toBe(L.filter((x) => x.bill.billPaid === true).length);
        for (const y of years) for (const st of ['all', 'paid', 'unpaid', 'deleted'] as const) {
          const f = filterBills(all, { year: y, month: null, type: null, status: st });
          const yr = (xs: BillWithUnits[]) => xs.filter((x) => x.bill.year === y);
          const exp = st === 'deleted' ? yr(all.filter((x) => isBillDeleted(x.bill))) : st === 'paid' ? yr(L.filter((x) => isBillPaid(x.bill))) : st === 'unpaid' ? yr(L.filter((x) => !isBillPaid(x.bill))) : yr(L);
          expect(f.length).toBe(exp.length);
          for (const mo of [1, 6, 12]) for (const ty of [null, 'water' as const]) {
            const g = filterBills(all, { year: y, month: mo, type: ty, status: st });
            expect(g.length).toBe(exp.filter((x) => x.bill.month === mo && (ty === null || x.bill.expenseType === ty)).length);
          }
        }
        let unsettledAll = 0;
        for (const year of years) {
          const own = L.filter((x) => x.bill.year === year);
          const rep = yearlyReport(L, year);
          expect(rep.billCount).toBe(own.length);
          expect(rep.grandTotal).toBe(sumN(own.map((x) => x.bill.totalAmount)));
          const paidSum = sumN(own.flatMap((x) => x.units.map((u) => Math.min(sumN((u.payments ?? (u.isSettled ? [{ amount: u.shareAmount }] : [])).map((p) => p.amount)), u.shareAmount))));
          expect(rep.settledTotal).toBe(paidSum);
          expect(rep.unsettledTotal).toBe(rep.grandTotal - rep.settledTotal);
          expect(sumN(rep.byType.map((t) => t.total))).toBe(rep.grandTotal);
          expect(sumN(rep.byType.map((t) => t.count))).toBe(rep.billCount);
          expect(sumN(rep.byMonth.map((m) => m.total))).toBe(rep.grandTotal);
          expect(sumN(rep.byMonth.map((m) => m.count))).toBe(rep.billCount);
          rep.byMonth.forEach((m) => expect(sumN(Object.values(m.byType) as number[])).toBe(m.total));
          if (rep.grandTotal > 0) expect(Math.abs(sumN(rep.byType.map((t) => t.percent)) - 100)).toBeLessThan(0.1 * rep.byType.length + 0.01);
          unsettledAll += rep.unsettledTotal;

          // جمع ماه / با جزئیات
          for (const month of monthsWithBills(L, year)) {
            const mb = own.filter((x) => x.bill.month === month);
            const t = monthlyTotals(L, year, month);
            const billsTotal = sumN(mb.map((x) => x.bill.totalAmount));
            expect(t.billsTotal).toBe(billsTotal);
            expect(t.grandTotal).toBe(billsTotal); // جمع سهم واحدها = جمع قبض‌ها
            expect(sumN(t.units.map((u) => u.total))).toBe(billsTotal);
            expect(t.paidTotal + t.remainingTotal).toBe(t.grandTotal);
            expect(sumN(t.byType.map((b) => b.total))).toBe(billsTotal);
            expect(t.bills.length).toBe(mb.length);
            const nums = new Set(mb.flatMap((x) => x.units.map((u) => u.unitNumber)));
            expect(t.units.length).toBe(nums.size);
            expect(t.occupiedCount + t.vacantCount).toBe(nums.size);
            for (const u of t.units) {
              const raw = mb.flatMap((x) => x.units.filter((q) => q.unitNumber === u.unitNumber));
              const rawLive = raw.filter((q) => q.vacant !== true);
              expect(u.vacant).toBe(rawLive.length === 0);
              expect(u.total).toBe(sumN(rawLive.map((q) => q.shareAmount)));
              expect(u.paid).toBe(sumN(rawLive.map(paidAmount)));
              expect(u.remaining).toBe(sumN(rawLive.map(remainingAmount)));
              expect(u.paid + u.remaining).toBe(u.total);
              expect(sumN(u.items.map((i) => i.amount))).toBe(u.total);
              if (u.vacant) { expect(u.items.length).toBe(0); expect(u.total).toBe(0); expect(u.status).toBe('vacant'); }
              else expect(u.status).toBe(u.remaining === 0 ? 'paid' : u.paid > 0 ? 'partial' : 'unpaid');
            }
            // سندهای گزارش: عددِ هر ردیف سند = عدد مدل
            const docs = [monthlyDoc(t), monthlyDetailDoc(t)];
            for (const d of docs) cleanDoc(d);
            const rows = (monthlyDoc(t).blocks.find((b) => b.k === 'rows' && b.rows.length) as Extract<DocBlock, { k: 'rows' }> | undefined);
            if (rows) {
              expect(rows.rows.length).toBe(t.units.length);
              rows.rows.forEach((r, i) => { if (!t.units[i].vacant) expect(docNum(r.value)).toBe(t.units[i].remaining); }); // ۱.۷.۴: عدد اصلی «قابل پرداخت» = مانده
              expect(docNum(rows.footer!.value)).toBe(t.remainingTotal);
            }
          }
          // نمودار
          const cs = chartSeries(L, year, null, 1, 12);
          expect(cs.total).toBe(rep.grandTotal);
          expect(sumN(cs.months.map((m) => m.count))).toBe(rep.billCount);
          rep.byMonth.forEach((m, i) => expect(cs.months[i].total).toBe(m.total));
          const sh = typeShares(L, year, 1, 12);
          expect(sh.total).toBe(rep.grandTotal);
          expect(sumN(sh.shares.map((s) => s.count))).toBe(rep.billCount);
          for (const ty of EXPENSE_TYPE_ORDER) {
            const c1 = chartSeries(L, year, ty, 1, 12);
            expect(c1.total).toBe(sumN(own.filter((x) => x.bill.expenseType === ty).map((x) => x.bill.totalAmount)));
          }
          const cr = chartSeries(L, year, null, 9, 3); // بازهٔ برعکس نرمال می‌شود
          expect([cr.from, cr.to]).toEqual([3, 9]);
          expect(cr.total).toBe(sumN(own.filter((x) => x.bill.month >= 3 && x.bill.month <= 9).map((x) => x.bill.totalAmount)));
          for (const kind of ['bar', 'line', 'pie'] as const) cleanDoc(chartDoc(kind, year, null, cs, sh));
          // پرداخت قبض‌ها
          const bp = billPaymentReport(all, year, null, TODAY);
          expect(bp.summary.total).toBe(own.length);
          expect(bp.summary.paid + bp.summary.unpaid).toBe(bp.summary.total);
          expect(bp.summary.paid).toBe(own.filter((x) => x.bill.billPaid === true).length);
          expect(bp.summary.onTime + bp.summary.late + bp.summary.paidUndated).toBe(bp.summary.paid);
          expect(bp.summary.overdue + bp.summary.unpaidNoDue).toBeLessThanOrEqual(bp.summary.unpaid);
          expect(bp.summary.unpaidNoDue).toBe(own.filter((x) => !x.bill.billPaid && !x.bill.dueDate).length);
          cleanDoc(billPaymentsDoc(bp.rows, bp.summary, year, null));
          cleanDoc(yearlyDoc(rep));
        }
        // بدهکاران = مجموع مانده‌های همهٔ سال‌ها = جمع «پرداخت‌نشده»ِ سالانه
        const debt = debtorsReport(L, NOW);
        expect(debt.grandTotal).toBe(unsettledAll);
        expect(sumN(debt.units.map((u) => u.total))).toBe(debt.grandTotal);
        expect(debt.openBills).toBe(L.filter((x) => x.units.some((u) => remainingAmount(u) > 0 && !u.vacant)).length);
        for (const u of debt.units) {
          expect(u.total).toBeGreaterThan(0);
          expect(sumN(u.items.map((i) => i.amount))).toBe(u.total);
          for (const it of u.items) {
            const src = L.find((x) => x.bill.id === it.billId)!.units.find((q) => q.unitNumber === u.unitNumber)!;
            expect(src.vacant).not.toBe(true);
            expect(it.amount).toBe(remainingAmount(src));
          }
        }
        cleanDoc(debtorsDoc(debt));
        // هشدارها فقط برای قبض پرداخت‌نشده/حذف‌نشده با مهلت ≤ ۲ روز
        const al = selectDueAlerts(L.map((x) => x.bill), TODAY);
        const expAl = L.filter((x) => {
          if (x.bill.billPaid || !x.bill.dueDate) return false;
          const [y, m, d] = x.bill.dueDate.split('-').map(Number);
          return jalaliToDayNumber({ year: y, month: m, day: d }) - jalaliToDayNumber(TODAY) <= 2;
        });
        expect(al.length).toBe(expAl.length);
        expect(new Set(al.map((a) => a.billId))).toEqual(new Set(expAl.map((x) => x.bill.id)));
        // حذف‌شده‌ها هرگز در هیچ گزارشی نیستند
        const delIds = new Set(all.filter((x) => isBillDeleted(x.bill)).map((x) => x.bill.id));
        expect(debt.units.flatMap((u) => u.items).some((i) => delIds.has(i.billId))).toBe(false);
        expect(al.some((a) => delIds.has(a.billId))).toBe(false);
      }
    });
  }
});

const BAD = /NaN|undefined|Infinity|null|\[object|-0(?!\d)/;
function docNum(s: string): number { return Number(normalizeDigits(s).replace(/[^0-9]/g, '')); }
function docStrings(d: ReportDoc): string[] {
  const out: string[] = [d.title, d.subtitle];
  for (const b of d.blocks) {
    if (b.k === 'summary') out.push(b.label, b.value, b.unit, ...b.meta, ...(b.lines ?? []).flatMap((l) => [l.label, l.value]));
    else if (b.k === 'heading' || b.k === 'note') out.push(b.text);
    else if (b.k === 'rows') { for (const r of b.rows) out.push(r.label, r.value, r.sub ?? '', r.tag?.text ?? ''); if (b.footer) out.push(b.footer.label, b.footer.value); }
    else out.push(b.title);
  }
  return out;
}
function cleanDoc(d: ReportDoc) {
  for (const s of docStrings(d)) {
    expect(s, `${d.id}: «${s}»`).not.toMatch(BAD);
  }
  expect(d.fileBase).toMatch(/^[A-Za-z0-9_-]+$/);
}

describe('QA 1.7.0 — مبلغ بسیار بزرگ', () => {
  it('یک قبض با مبلغ MAX_SAFE_INTEGER در همهٔ گزارش‌ها دقیق است؛ جمع چند قبض فراتر از آن متناهی می‌ماند', () => {
    const M = Number.MAX_SAFE_INTEGER;
    for (const method of METHODS) {
      const b = mk({ year: 1405, month: 7, type: 'building', total: M, method, persons: ['3', '5', '7', '11', '13'], vacant: [false, true, false, false, false], areas: ['10.001', '3', '77.777', '0.001', '1000'] });
      expect(sumBig(b.units.map((u) => u.shareAmount))).toBe(BigInt(M));
      expect(yearlyReport([b], 1405).grandTotal).toBe(M);
      expect(monthlyTotals([b], 1405, 7).grandTotal).toBe(M);
      expect(chartSeries([b], 1405, null, 1, 12).total).toBe(M);
      expect(debtorsReport([b], NOW).grandTotal).toBe(M);
      for (const d of [monthlyDoc(monthlyTotals([b], 1405, 7)), yearlyDoc(yearlyReport([b], 1405))]) cleanDoc(d);
    }
    const two = [mk({ year: 1405, month: 7, type: 'gas', total: M, method: 'perUnit', persons: ['1'], vacant: [false], areas: ['1'] }, 1), mk({ year: 1405, month: 7, type: 'water', total: M, method: 'perUnit', persons: ['1'], vacant: [false], areas: ['1'] }, 2)];
    const y = yearlyReport(two, 1405);
    expect(Number.isFinite(y.grandTotal)).toBe(true);
    cleanDoc(yearlyDoc(y));
  });
});

// ───────── ۳) واحد خالی هرگز شمرده نمی‌شود ─────────
describe('QA 1.7.0 — واحد خالی', () => {
  it('همه خالی جز یکی: تمام مبلغ به همان یک واحد؛ در ماهانه vacantCount درست؛ در بدهکاران نیست', () => {
    for (const method of METHODS) {
      const persons = Array(12).fill('4'); const vacant = Array(12).fill(true); vacant[7] = false;
      const b = mk({ year: 1405, month: 6, type: 'electricity', total: 123_456_789, method, persons, vacant, areas: Array(12).fill('77.25') });
      expect(b.units[7].shareAmount).toBe(123_456_789);
      expect(b.units.filter((u) => u.shareAmount > 0).length).toBe(1);
      const t = monthlyTotals([b], 1405, 6);
      expect(t.occupiedCount).toBe(1); expect(t.vacantCount).toBe(11);
      expect(t.units.filter((u) => u.vacant).every((u) => u.total === 0 && u.items.length === 0)).toBe(true);
      const d = debtorsReport([b], NOW);
      expect(d.units.map((u) => u.unitNumber)).toEqual([8]);
      expect(d.allUnitNumbers).toEqual([8]);
    }
  });
  it('همه خالی ← اعتبارسنجی رد می‌کند؛ نفرات صفر در «بر اساس نفرات» رد می‌شود', () => {
    const base = { ...emptyDraft(1405, 6, null), expenseType: 'water' as const, amountDigits: '1000', personCounts: ['2', '3'], unitAreas: ['10', '20'], splitMethod: 'perPerson' as const };
    expect(validateDraft({ ...base, unitVacant: [true, true] }).ok).toBe(false);
    expect(validateDraft({ ...base, personCounts: ['0', '0'], unitVacant: [false, false] }).ok).toBe(false);
    expect(validateDraft({ ...base, unitVacant: [true, false] }).ok).toBe(true);
    expect(validateDraft({ ...base, amountDigits: '0' }).ok).toBe(false);
    expect(validateDraft({ ...base, amountDigits: '' }).ok).toBe(false);
    expect(validateDraft({ ...base, amountDigits: '9007199254740993' }).ok).toBe(false); // بیش از MAX_SAFE
  });
  it('واحد خالی در یک قبض و پر در قبض دیگرِ همان ماه: فقط سهمِ قبض‌های پر شمرده می‌شود', () => {
    const a = mk({ year: 1405, month: 2, type: 'water', total: 1000, method: 'perUnit', persons: ['1', '1'], vacant: [false, true], areas: ['1', '1'] }, 1);
    const b = mk({ year: 1405, month: 2, type: 'gas', total: 3000, method: 'perUnit', persons: ['1', '1'], vacant: [false, false], areas: ['1', '1'] }, 2);
    const t = monthlyTotals([a, b], 1405, 2);
    expect(t.units[0].total).toBe(1000 + 1500);
    expect(t.units[1].total).toBe(1500);
    expect(t.units[1].vacant).toBe(false);
    expect(t.grandTotal).toBe(4000);
  });
});

// ───────── ۴) حذف نرم / بازگردانی / انواع خاموش ─────────
describe('QA 1.7.0 — حذف نرم و انواع خاموش در همهٔ گزارش‌ها', () => {
  it('حذف ← همه‌جا کم می‌شود؛ بازگردانی ← دقیقاً به حالت اول برمی‌گردد', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const all = genBills(seed, PROFILES[7]).map((x) => ({ ...x, bill: { ...x.bill, deletedAt: null, billPaid: false, billPaidDate: null } }));
      const snap = (xs: BillWithUnits[]) => JSON.stringify([yearlyReport(live(xs), xs[0].bill.year), debtorsReport(live(xs), NOW), summarizeBills(live(xs)), monthlyTotals(xs, xs[0].bill.year, xs[0].bill.month)]);
      const before = snap(all);
      const del = all.map((x, i) => (i === 0 ? { ...x, bill: softDeleteBill(x.bill, NOW) } : x));
      expect(summarizeBills(live(del)).count).toBe(all.length - 1);
      expect(snap(del)).not.toBe(before);
      const back = del.map((x, i) => (i === 0 ? { ...x, bill: restoreBill(x.bill) } : x));
      expect(snap(back)).toBe(before);
    }
  });
  it('نوع خاموش: دادهٔ ذخیره‌شده دست‌نخورده، ولی همهٔ گزارش‌ها فقط انواع فعال را می‌شمارند', () => {
    const enabled: ExpenseType[] = ['water', 'gas', 'building'];
    for (let seed = 1; seed <= 20; seed++) {
      const all = live(genBills(seed * 3, PROFILES[7]));
      const vis = visibleBills(all, { types: enabled, methods: METHODS } as never);
      expect(vis.every((x) => enabled.includes(x.bill.expenseType))).toBe(true);
      const year = all[0].bill.year;
      const rep = yearlyReport(vis, year, enabled);
      expect(rep.grandTotal).toBe(sumN(all.filter((x) => x.bill.year === year && enabled.includes(x.bill.expenseType)).map((x) => x.bill.totalAmount)));
      expect(rep.byType.length).toBe(3);
      const m = all[0].bill.month;
      const t = monthlyTotals(all, year, m, enabled);
      expect(t.billsTotal).toBe(sumN(all.filter((x) => x.bill.year === year && x.bill.month === m && enabled.includes(x.bill.expenseType)).map((x) => x.bill.totalAmount)));
      expect(t.grandTotal).toBe(t.billsTotal);
      expect(chartSeries(all, year, null, 1, 12, enabled).total).toBe(rep.grandTotal);
      expect(typeShares(all, year, 1, 12, enabled).total).toBe(rep.grandTotal);
    }
  });
});

// ───────── ۵) پشتیبان: رفت‌وبرگشت و مهاجرت v1..v7 ─────────
function dataOf(all: BillWithUnits[]) {
  return { bills: all.map((x) => x.bill), units: all.flatMap((x) => x.units), settings: sanitizeSettings({ activeYears: [1403, 1404, 1405, 1406] } as never) };
}
describe('QA 1.7.0 — پشتیبان', () => {
  it('رفت‌وبرگشت (ایجاد ← متن ← خواندن ← ایجاد) برای همهٔ سناریوها ثابت و بی‌اتلاف است', () => {
    for (const pr of PROFILES) for (let seed = 1; seed <= 6; seed++) {
      const all = genBills(seed * 11, pr);
      const f1 = createBackup({ ...dataOf(all), building: undefined }, '1.7.0', NOW);
      expect(f1.backupVersion).toBe(BACKUP_VERSION);
      const txt = serializeBackup(f1);
      const p = parseBackup(txt);
      if (!p.ok) throw new Error(pr.name + ': ' + p.error);
      expect(p.backup.data.bills.length).toBe(all.length);
      expect(p.summary.deletedBills).toBe(all.filter((x) => isBillDeleted(x.bill)).length);
      const t2 = serializeBackup(createBackup(p.backup.data, '1.7.0', NOW));
      const p2 = parseBackup(t2);
      expect(p2.ok).toBe(true);
      // دادهٔ قبض/واحد دقیقاً برابر
      const norm = (u: Unit) => JSON.stringify({ ...u, payments: u.payments });
      for (const x of all) {
        const got = p.backup.data.units.filter((u) => u.billId === x.bill.id).sort((a, b) => a.unitNumber - b.unitNumber);
        expect(got.map((u) => [u.unitNumber, u.shareAmount, u.vacant === true, u.area ?? null, u.alias ?? null, u.personCount])).toEqual(
          x.units.map((u) => [u.unitNumber, u.shareAmount, u.vacant === true, u.area ?? null, u.alias ?? null, u.personCount]));
        got.forEach((u, i) => expect(paidAmount(u)).toBe(paidAmount(x.units[i])));
        void norm;
      }
    }
  });

  it('مهاجرت از قالب‌های ۱ تا ۶: فایل قدیمی بدون فیلدهای تازه بی‌خطا خوانده می‌شود و عددها تغییر نمی‌کنند', () => {
    const all = genBills(4242, PROFILES[7]).map((x) => ({
      bill: { ...x.bill, splitMethod: x.bill.splitMethod === 'perArea' ? 'perPerson' as const : x.bill.splitMethod },
      units: x.units,
    }));
    // قبض‌های قدیمی «بر اساس نفرات/واحد»: سهم‌ها را دوباره از مسیر واقعی بسازیم تا جمع‌ها با مبلغ بخواند
    const rebuilt = all.map((x, i) => {
      const persons = x.units.map((u) => String(Math.max(1, u.personCount)));
      return mk({ year: x.bill.year, month: x.bill.month, type: x.bill.expenseType, total: x.bill.totalAmount, method: x.bill.splitMethod === 'perUnit' ? 'perUnit' : 'perPerson', persons, vacant: x.units.map(() => false), areas: x.units.map(() => '1') }, i);
    });
    const base = createBackup(dataOf(rebuilt), '1.7.0', NOW);
    const json = JSON.parse(serializeBackup(base));
    const strip = (v: number) => {
      const j = JSON.parse(JSON.stringify(json));
      j.backupVersion = v;
      for (const b of j.data.bills) {
        if (v < 4) { delete b.billPaid; delete b.billPaidDate; delete b.dueDate; delete b.deletedAt; }
        if (v < 3) delete b.splitMethod;
      }
      for (const u of j.data.units) {
        delete u.area; // قالب ۷
        if (v < 6) delete u.vacant;
        if (v < 5) delete u.alias;
        if (v < 2) delete u.payments;
      }
      if (v < 6) { /* ساختمان v6 به بعد */ }
      if (v < 5) delete j.data.building;
      if (v < 3) delete j.data.splitDefaults;
      if (v === 2 || v === 3 || v === 4) j.data.unitTemplate = rebuilt[0].units.map((u) => u.personCount);
      return JSON.stringify(j);
    };
    for (let v = 1; v <= 7; v++) {
      const p = parseBackup(strip(v));
      if (!p.ok) throw new Error(`v${v}: ${p.error}`);
      expect(p.backup.data.bills.length).toBe(rebuilt.length);
      expect(sumN(p.backup.data.bills.map((b) => b.totalAmount))).toBe(sumN(rebuilt.map((x) => x.bill.totalAmount)));
      expect(p.backup.data.building && p.backup.data.building.units.length > 0).toBe(true);
      for (const b of p.backup.data.bills) {
        expect(typeof b.billPaid).toBe('boolean');
        expect(b.deletedAt === null || typeof b.deletedAt === 'string').toBe(true);
        expect(b.dueDate === null || typeof b.dueDate === 'string').toBe(true);
        if (v < 3) expect(b.splitMethod === undefined || b.splitMethod === 'perPerson').toBe(true);
        expect(sumN(p.backup.data.units.filter((u) => u.billId === b.id).map((u) => u.shareAmount))).toBe(b.totalAmount);
      }
      if (v < 4) expect(p.backup.data.bills.every((b) => !b.billPaid && b.deletedAt === null && b.dueDate === null)).toBe(true);
      // و قابل بازنویسی در قالب ۷
      const again = parseBackup(serializeBackup(createBackup(p.backup.data, '1.7.0', NOW)));
      expect(again.ok).toBe(true);
    }
  });

  it('فایل‌های خراب/ناسازگار با پیام فارسی رد می‌شوند و هرگز استثنا نمی‌اندازند (فاز)', () => {
    const all = genBills(9, PROFILES[7]);
    const good = serializeBackup(createBackup(dataOf(all), '1.7.0', NOW));
    const j = JSON.parse(good);
    const cases: [string, (x: any) => void][] = [
      ['wrong app', (x) => { x.app = 'other'; }],
      ['newer version', (x) => { x.backupVersion = 99; }],
      ['version 0', (x) => { x.backupVersion = 0; }],
      ['sum mismatch', (x) => { x.data.units[0].shareAmount += 1; }],
      ['dup bill id', (x) => { x.data.bills[1].id = x.data.bills[0].id; }],
      ['orphan unit', (x) => { x.data.units[0].billId = 'zzz'; }],
      ['bad month', (x) => { x.data.bills[0].month = 13; }],
      ['negative total', (x) => { x.data.bills[0].totalAmount = -5; }],
      ['float total', (x) => { x.data.bills[0].totalAmount = 10.5; }],
      ['unsafe total', (x) => { x.data.bills[0].totalAmount = 2 ** 60; }],
      ['bad expense', (x) => { x.data.bills[0].expenseType = 'rent'; }],
      ['bad due', (x) => { x.data.bills[0].dueDate = '1405-13-40'; }],
      ['no units', (x) => { x.data.units = []; }],
      ['bills not array', (x) => { x.data.bills = {}; }],
      ['no data', (x) => { delete x.data; }],
      ['bad createdAt', (x) => { x.createdAt = 'yesterday'; }],
    ];
    for (const [name, mut] of cases) {
      const c = JSON.parse(good); mut(c);
      const r = parseBackup(JSON.stringify(c));
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(String(r.error).length, name).toBeGreaterThan(3);
    }
    expect(parseBackup('').ok).toBe(false);
    expect(parseBackup('{not json').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('\uFEFF' + good).ok).toBe(true); // BOM
    // فاز تصادفی: جابه‌جایی مقدار تصادفی در JSON هرگز استثنا نمی‌اندازد
    const r = rng(777);
    const junk = [null, 'x', -1, 1.5, [], {}, true, 1e300, '۱۲۳'];
    for (let k = 0; k < 600; k++) {
      const c = JSON.parse(good);
      const targets: any[] = [c, c.data, c.data.bills[int(r, 0, c.data.bills.length - 1)], c.data.units[int(r, 0, c.data.units.length - 1)], c.data.settings, c.data.building].filter(Boolean);
      const t = pick(r, targets); const keys = Object.keys(t);
      if (keys.length) t[pick(r, keys)] = pick(r, junk);
      expect(() => parseBackup(JSON.stringify(c))).not.toThrow();
    }
    void j;
  });
});

// ───────── ۶) ارقام فارسی/عربی و ورودی‌ها ─────────
describe('QA 1.7.0 — ارقام فارسی/عربی و ورودی‌ها', () => {
  it('مبلغ با ارقام فارسی/عربی/مخلوط و جداکننده‌ها درست خوانده می‌شود', () => {
    expect(parseAmount('۱۲٬۵۰۰٬۰۰۰')).toBe(12500000);
    expect(parseAmount('١٢,٥٠٠,٠٠٠')).toBe(12500000);
    expect(parseAmount('۱2٬٥00')).toBe(12500);
    expect(parseAmount('')).toBeNull();
    expect(onlyDigits('۱۲ abc ٣٤')).toBe('1234');
    expect(sanitizePersonCount('۳')).toBe('3');
    expect(sanitizePersonCount('٤٥ x')).toBe('45');
    expect(toPersianDigits(formatAmount(9007199254740991))).toBe('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۱'.replace(/٬/g, ','));
    const r = reformatAmountInput('۱۲۳۴۵۶', 6);
    expect(r.digits).toBe('123456');
  });
  it('متراژ: ارقام فارسی/اعشار فارسی و حداکثر سه رقم اعشار', () => {
    expect(parseAreaInput('۸۵٫۵')).toBe(85.5);
    expect(parseAreaInput('۸۵.۱۲۳۴')).not.toBe(85.1234); // بیش از ۳ رقم اعشار گرد/رد می‌شود
    expect(parseArea(0)).toBeNull();
    expect(parseArea(-1)).toBeNull();
    expect(sanitizeAreaInput('١٢٫٣٤٥')).toMatch(/^12[.٫]345$|^12\.345$/);
  });
  it('قبض از مسیر فرم با ارقام فارسی (مبلغ/نفرات/متراژ) سهم درست می‌دهد', () => {
    const d = { ...emptyDraft(1405, 7, null), expenseType: 'gas' as const, amountDigits: onlyDigits('۱٬۰۰۰٬۰۰۰'), personCounts: [sanitizePersonCount('۲'), sanitizePersonCount('٣')],
      unitVacant: [false, false], unitAreas: [sanitizeAreaInput('۱۰٫۵'), sanitizeAreaInput('۳۱٫۵')], unitAliases: [null, null], splitMethod: 'perArea' as const };
    const v = validateDraft(d);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const c = calculateBySplit(v.value.totalAmount, v.value.personCounts, 'perArea', v.value.vacant, v.value.areas);
      expect(c.shares.map((s) => s.shareAmount)).toEqual([250000, 750000]);
    }
  });
});

// ───────── ۷) تقویم شمسی در برابر Intl ─────────
describe('QA 1.7.0 — تقویم شمسی (مقایسه با Intl)', () => {
  it('تبدیل میلادی↔شمسی برای ۴۰۰۰ تاریخ تصادفی با Intl یکسان است', () => {
    const r = rng(31337);
    const fmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
    for (let k = 0; k < 4000; k++) {
      const t = Date.UTC(2015, 0, 1) + Math.floor(r() * 365 * 25) * 86400000;
      const dt = new Date(t);
      const parts = Object.fromEntries(fmt.formatToParts(dt).map((p) => [p.type, p.value]));
      const j = gregorianToJalali(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      expect([j.year, j.month, j.day]).toEqual([Number(parts.year), Number(parts.month), Number(parts.day)]);
      const g = jalaliToGregorian(j);
      expect([g.year, g.month, g.day]).toEqual([dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]);
    }
  });
  it('طول ماه/کبیسه سازگار با اختلاف روز', () => {
    for (let y = 1400; y <= 1410; y++) {
      let days = 0;
      for (let m = 1; m <= 12; m++) days += jalaliMonthLength(y, m);
      expect(days).toBe(isJalaliLeapYear(y) ? 366 : 365);
      expect(jalaliToDayNumber({ year: y + 1, month: 1, day: 1 }) - jalaliToDayNumber({ year: y, month: 1, day: 1 })).toBe(days);
    }
  });
});

// ───────── ۸) متن‌های راهنما با رفتار واقعی هم‌خوان باشند (رگرسیون ۱.۷.۱) ─────────
import { readFileSync } from 'node:fs';
import { ALERT_DAYS_BEFORE } from '../src/logic/dueAlerts';
describe('QA 1.7.1 — هم‌خوانی متن راهنما با رفتار', () => {
  const src = (p: string) => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
  it('راهنمای مهلت پرداخت «۲ روز قبل» است (همان ALERT_DAYS_BEFORE)', () => {
    expect(ALERT_DAYS_BEFORE).toBe(2);
    for (const f of ['screens/NewBillScreen.tsx', 'screens/BillDetailsScreen.tsx', 'screens/TutorialScreen.tsx']) {
      expect(src(f)).toContain('از ۲ روز قبل');
      expect(src(f)).not.toContain('از یک روز قبل');
    }
  });
  it('توضیح واحد خالی از «سه» روش تقسیم می‌گوید و هیچ نویسهٔ خراب (U+FFFD) در متن‌ها نیست', () => {
    expect(src('components/BuildingSection.tsx')).toContain('هیچ‌کدام از سه روش تقسیم');
    for (const f of ['screens/TutorialScreen.tsx', 'components/BuildingSection.tsx', 'screens/NewBillScreen.tsx', 'screens/BillDetailsScreen.tsx']) expect(src(f)).not.toContain('\uFFFD');
  });
});

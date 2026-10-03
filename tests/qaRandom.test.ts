/**
 * QA نهایی ۱.۶.۱۱: آزمون‌های تصادفی (PRNG ثابت ← تکرارپذیر) روی ریاضی تقسیم، جمع‌ها، پرداخت‌ها،
 * ویرایش، حذف نرم، فیلتر انواع خاموش و رفت‌وبرگشت پشتیبان (قالب ۷ و قالب‌های قدیمی).
 */
import { describe, expect, it } from 'vitest';
import type { BillWithUnits, ExpenseType, SplitMethod } from '../src/models/types';
import { EXPENSE_TYPE_ORDER } from '../src/models/constants';
import { calculateShares } from '../src/logic/calculation';
import { calculateBySplit } from '../src/logic/split';
import { AREA_SCALE, areaToMilli, parseArea, sanitizeAreaInput } from '../src/logic/area';
import { emptyDraft, buildBill, draftFromBill } from '../src/logic/billFactory';
import { validateDraft } from '../src/logic/validation';
import { addPayment, paidAmount, remainingAmount, settleFully, clearPayments } from '../src/logic/payments';
import { yearlyReport } from '../src/logic/report';
import { debtorsReport, paymentHistory } from '../src/logic/debts';
import { softDeleteBill, restoreBill, setBillPaid } from '../src/logic/billPaid';
import { createBackup, parseBackup, serializeBackup, BACKUP_VERSION } from '../src/logic/backup';
import { DEFAULT_ENTRY_PREFS, visibleBills } from '../src/logic/entryPrefs';
import { filterBills } from '../src/logic/billFilter';
import { sanitizeSettings } from '../src/logic/settings';
import { formatAmount, normalizeDigits, onlyDigits, parseAmount, sanitizePersonCount, toPersianDigits } from '../src/logic/formatting';

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
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function randAmount(r: R, huge = true): number {
  const k = huge ? r() : r() * 0.9;
  if (k < 0.1) return int(r, 1, 20);
  if (k < 0.5) return int(r, 1, 50_000_000);
  if (k < 0.9) return int(r, 1, 5_000_000_000_000);
  return int(r, MAX_SAFE - 1000, MAX_SAFE); // مبلغ بسیار بزرگ
}
const randArea = (r: R) => (int(r, 1, 5_000_000)) / 1000; // 0.001 .. 5000 با سه رقم اعشار

interface Case { total: number; persons: number[]; vacant: boolean[]; areas: number[]; method: SplitMethod }
function randCase(r: R, huge = true): Case {
  const n = int(r, 1, 14);
  const persons = Array.from({ length: n }, () => (r() < 0.1 ? 0 : int(r, 1, r() < 0.2 ? 400 : 8)));
  const vacant = Array.from({ length: n }, () => r() < 0.2);
  if (vacant.every(Boolean)) vacant[int(r, 0, n - 1)] = false; // اعتبارسنجی «همه خالی» را مسدود می‌کند
  const areas = Array.from({ length: n }, () => randArea(r));
  const method = pick(r, METHODS);
  // «بر اساس نفرات»: حداقل یک واحد غیرخالی با نفرات > ۰ (در غیر این صورت اعتبارسنجی مسدود می‌کند)
  if (method === 'perPerson' && !persons.some((p, i) => p > 0 && !vacant[i])) persons[vacant.findIndex((v) => !v)] = 1;
  return { total: randAmount(r, huge), persons, vacant, areas, method };
}

describe('تقسیم: ویژگی‌های تصادفی (۲۰۰۰ مورد)', () => {
  it('جمع سهم‌ها دقیقاً مبلغ کل؛ صحیح، غیرمنفی، متناهی؛ خالی=۰؛ هر سهم بین کف و سقفِ مقدار دقیق؛ قطعی', () => {
    const r2 = rng(20261003);
    for (let k = 0; k < 2000; k++) {
      const c = randCase(r2);
      const res = calculateBySplit(c.total, c.persons, c.method, c.vacant, c.areas);
      const again = calculateBySplit(c.total, c.persons, c.method, c.vacant, c.areas);
      expect(again.shares.map((s) => s.shareAmount)).toEqual(res.shares.map((s) => s.shareAmount));
      let sum = 0n;
      const w = c.persons.map((p, i) => (c.vacant[i] ? 0 : c.method === 'perUnit' ? 1 : c.method === 'perArea' ? areaToMilli(c.areas[i]) : p));
      const W = w.reduce((s, x) => s + BigInt(x), 0n);
      res.shares.forEach((s, i) => {
        expect(Number.isSafeInteger(s.shareAmount)).toBe(true);
        expect(s.shareAmount).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(s.shareAmount)).toBe(false);
        sum += BigInt(s.shareAmount);
        if (c.vacant[i] || w[i] === 0) { expect(s.shareAmount).toBe(0); expect(s.roundedUp).toBe(false); }
        else {
          const exactNum = BigInt(c.total) * BigInt(w[i]); // = exact * W
          const lo = exactNum / W;
          const hi = (exactNum + W - 1n) / W;
          expect(BigInt(s.shareAmount) >= lo && BigInt(s.shareAmount) <= hi).toBe(true);
        }
        expect(s.personCount).toBe(c.persons[i]); // نفرات واقعی دست‌نخورده
      });
      expect(sum).toBe(BigInt(c.total));
      expect(res.shares.filter((s) => s.roundedUp).length).toBe(res.remainder);
    }
  });
  it('«بر اساس واحد»: سهم واحدهای غیرخالی حداکثر ۱ تومان اختلاف دارند؛ «بر اساس نفرات» با ضرب نفرات در k تغییری نمی‌کند', () => {
    const r2 = rng(7);
    for (let k = 0; k < 1000; k++) {
      const c = randCase(r2);
      const u = calculateBySplit(c.total, c.persons, 'perUnit', c.vacant, c.areas).shares.filter((_, i) => !c.vacant[i]).map((s) => s.shareAmount);
      expect(Math.max(...u) - Math.min(...u)).toBeLessThanOrEqual(1);
      if (c.persons.some((p, i) => p > 0 && !c.vacant[i])) {
        const kx = int(r2, 2, 9);
        const a = calculateBySplit(c.total, c.persons, 'perPerson', c.vacant).shares.map((s) => s.shareAmount);
        const b = calculateBySplit(c.total, c.persons.map((p) => p * kx), 'perPerson', c.vacant).shares.map((s) => s.shareAmount);
        expect(b).toEqual(a);
      }
    }
  });
  it('«بر اساس متراژ» با متراژهای برابر = «بر اساس واحد»؛ بزرگ‌تر بودن متراژ هیچ‌وقت سهم کمتر از ۱ تومان نسبی نمی‌دهد', () => {
    const r2 = rng(99);
    for (let k = 0; k < 500; k++) {
      const c = randCase(r2);
      const same = c.areas.map(() => 75.5);
      const a = calculateBySplit(c.total, c.persons, 'perArea', c.vacant, same).shares.map((s) => s.shareAmount);
      const b = calculateBySplit(c.total, c.persons, 'perUnit', c.vacant).shares.map((s) => s.shareAmount);
      expect(a).toEqual(b);
      const res = calculateBySplit(c.total, c.persons, 'perArea', c.vacant, c.areas);
      const idx = c.areas.map((_, i) => i).filter((i) => !c.vacant[i]);
      for (const i of idx) for (const j of idx) {
        if (areaToMilli(c.areas[i]) > areaToMilli(c.areas[j])) expect(res.shares[i].shareAmount + 1).toBeGreaterThanOrEqual(res.shares[j].shareAmount);
      }
      expect(res.totalArea).toBeCloseTo(idx.reduce((s, i) => s + areaToMilli(c.areas[i]), 0) / AREA_SCALE, 6);
    }
  });
  it('موارد مرزی: یک واحد پرنفر، مبلغ ۱، مبلغ حداکثر امن، ورودی نامعتبر', () => {
    for (const m of METHODS) {
      const r1 = calculateBySplit(1, [3, 2, 5], m, [false, true, true], [10, 20, 30]);
      expect(r1.shares.map((s) => s.shareAmount)).toEqual([1, 0, 0]);
      const big = calculateBySplit(MAX_SAFE, [1, 1, 1], m, undefined, [1, 1, 1]);
      expect(big.shares.reduce((s, x) => s + BigInt(x.shareAmount), 0n)).toBe(BigInt(MAX_SAFE));
    }
    expect(() => calculateShares(0, [{ unitNumber: 1, personCount: 1 }])).toThrow();
    expect(() => calculateShares(-5, [{ unitNumber: 1, personCount: 1 }])).toThrow();
    expect(() => calculateShares(NaN, [{ unitNumber: 1, personCount: 1 }])).toThrow();
    expect(() => calculateShares(MAX_SAFE + 2, [{ unitNumber: 1, personCount: 1 }])).toThrow();
    expect(() => calculateShares(10, [{ unitNumber: 1, personCount: 0 }])).toThrow();
    expect(() => calculateShares(10, [{ unitNumber: 1, personCount: -1 }, { unitNumber: 2, personCount: 3 }])).toThrow();
  });
});

describe('ورودی عددی فارسی/عربی', () => {
  const r = rng(5);
  const toAr = (s: string) => s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  it('مبلغ، نفرات و متراژ با ارقام فارسی/عربی/انگلیسی و جداکننده‌ها یکسان خوانده می‌شوند (۱۰۰۰ مورد)', () => {
    for (let k = 0; k < 1000; k++) {
      const n = randAmount(r);
      const plain = String(n);
      const grouped = formatAmount(n);
      for (const form of [toPersianDigits(plain), toAr(plain), toPersianDigits(grouped).replace(/,/g, '٬'), toAr(grouped).replace(/,/g, '،'), grouped]) {
        expect(parseAmount(form)).toBe(n);
        expect(onlyDigits(form)).toBe(plain);
      }
      const p = int(r, 0, 9999);
      expect(sanitizePersonCount(toPersianDigits(String(p)))).toBe(String(p));
      expect(sanitizePersonCount(toAr(String(p)))).toBe(String(p));
      const a = randArea(r);
      const s = String(a);
      for (const form of [toPersianDigits(s).replace('.', '٫'), toAr(s).replace('.', '٫'), s.replace('.', '،'), s.replace('.', '/'), s]) {
        expect(parseArea(sanitizeAreaInput(form))).toBe(a);
        expect(parseArea(form)).toBe(a);
      }
    }
    expect(normalizeDigits('۱۲٣4')).toBe('1234');
  });
  it('مقدار نامعتبر: بیش از ۳ رقم اعشار، صفر، منفی، متن، بیش از حداکثر', () => {
    for (const bad of ['0', '0.000', '-5', '1e3', 'abc', '', '12.3456', '100001', '1..2']) expect(parseArea(bad)).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('99999999999999999999')).toBeNull();
  });
});

/* ---------- ساخت قبض از مسیر واقعی فرم ← اعتبارسنجی ← محاسبه ← buildBill ---------- */
let uid = 0;
function makeBill(r: R, opts: { year?: number; month?: number; type?: ExpenseType; now?: Date; huge?: boolean } = {}): BillWithUnits {
  for (;;) {
    const c = randCase(r, opts.huge ?? false);
    const d = emptyDraft(opts.year ?? pick(r, [1404, 1405]), opts.month ?? int(r, 1, 12), null);
    d.expenseType = opts.type ?? pick(r, EXPENSE_TYPE_ORDER);
    d.amountDigits = String(c.total);
    d.personCounts = c.persons.map(String);
    d.unitVacant = c.vacant;
    d.unitAreas = c.areas.map(String);
    d.unitAliases = c.persons.map(() => null);
    d.splitMethod = c.method;
    const v = validateDraft(d);
    if (!v.ok) continue;
    const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, c.method, v.value.vacant, v.value.areas);
    const x = buildBill(d, calc, null, opts.now ?? new Date(Date.UTC(2026, 0, 1 + (uid++ % 300))));
    return x;
  }
}

describe('قبض ساخته‌شده از مسیر واقعی (۱۰۰۰ مورد)', () => {
  it('جمع سهم‌ها = مبلغ؛ خالی ← سهم صفر و تسویه‌شده؛ عکس لحظهٔ متراژ فقط در perArea؛ نفرات واقعی ثبت می‌شود', () => {
    const r = rng(11);
    for (let k = 0; k < 1000; k++) {
      const { bill, units } = makeBill(r, { huge: true });
      expect(units.reduce((s, u) => s + u.shareAmount, 0)).toBe(bill.totalAmount);
      for (const u of units) {
        if (u.vacant) { expect(u.shareAmount).toBe(0); expect(u.isSettled).toBe(true); }
        if (bill.splitMethod === 'perArea' && !u.vacant) expect(parseArea(u.area ?? null)).not.toBeNull();
        if (bill.splitMethod !== 'perArea') expect(u.area).toBeUndefined();
        expect(remainingAmount(u)).toBe(u.shareAmount);
      }
      expect(bill.isFullySettled).toBe(units.every((u) => u.isSettled));
    }
  });
  it('ویرایش بدون تغییر: draftFromBill ← اعتبارسنجی ← محاسبه ← buildBill همان سهم‌ها و شناسه‌ها را می‌دهد (۵۰۰ مورد)', () => {
    const r = rng(12);
    for (let k = 0; k < 500; k++) {
      const orig = makeBill(r);
      const d = draftFromBill(orig);
      const v = validateDraft(d);
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, d.splitMethod, v.value.vacant, v.value.areas);
      const edited = buildBill(d, calc, orig);
      expect(edited.bill.id).toBe(orig.bill.id);
      expect(edited.bill.createdAt).toBe(orig.bill.createdAt);
      expect(edited.units.map((u) => u.shareAmount)).toEqual(orig.units.map((u) => u.shareAmount));
      expect(edited.units.map((u) => u.id)).toEqual(orig.units.map((u) => u.id));
      expect(edited.units.map((u) => u.vacant === true)).toEqual(orig.units.map((u) => u.vacant === true));
    }
  });
  it('ویرایش مبلغ: پرداخت‌های قبلی حفظ می‌شوند، مانده هیچ‌وقت منفی نمی‌شود و پرداخت‌شده ≤ سهم', () => {
    const r = rng(13);
    for (let k = 0; k < 400; k++) {
      let orig = makeBill(r);
      // چند پرداخت جزئی تصادفی
      orig = { ...orig, units: orig.units.map((u) => (u.shareAmount > 1 && r() < 0.6 ? addPayment(u, int(r, 1, u.shareAmount - 1)) : u)) };
      const d = { ...draftFromBill(orig), amountDigits: String(randAmount(r, false)) };
      const v = validateDraft(d);
      if (!v.ok) continue;
      const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, d.splitMethod, v.value.vacant, v.value.areas);
      const e = buildBill(d, calc, orig);
      expect(e.units.reduce((s, u) => s + u.shareAmount, 0)).toBe(e.bill.totalAmount);
      for (const u of e.units) {
        expect(remainingAmount(u)).toBeGreaterThanOrEqual(0);
        expect(paidAmount(u)).toBeLessThanOrEqual(u.shareAmount);
        expect(u.isSettled).toBe(remainingAmount(u) === 0);
      }
    }
  });
  it('تغییر تنظیمات ساختمان بعدی روی قبض ثبت‌شده اثر ندارد (عکس لحظه‌ای)', () => {
    const r = rng(14);
    const orig = makeBill(r);
    const frozen = JSON.stringify(orig);
    const next = emptyDraft(1405, 1, { units: [{ alias: 'تازه', defaultPersons: 9, area: 999 }] });
    expect(next.personCounts).toEqual(['9']);
    expect(JSON.stringify(orig)).toBe(frozen);
    expect(draftFromBill(orig).personCounts).toEqual(orig.units.map((u) => String(u.personCount)));
  });
});

describe('پرداخت‌ها', () => {
  it('پرداخت جزئی/کامل/پاک‌کردن: ناوردایی‌های مانده و تسویه (۲۰۰۰ مورد)', () => {
    const r = rng(21);
    for (let k = 0; k < 300; k++) {
      const { units } = makeBill(r);
      for (const u0 of units) {
        let u = u0;
        if (u.shareAmount === 0) { expect(() => addPayment(u, 1)).toThrow(); continue; }
        const steps = int(r, 0, 4);
        for (let s = 0; s < steps && remainingAmount(u) > 0; s++) {
          const amt = int(r, 1, remainingAmount(u));
          u = addPayment(u, amt);
          expect(remainingAmount(u)).toBeGreaterThanOrEqual(0);
          expect(paidAmount(u) + remainingAmount(u)).toBe(u.shareAmount);
          expect(u.isSettled).toBe(remainingAmount(u) === 0);
        }
        expect(() => addPayment(u, remainingAmount(u) + 1)).toThrow();
        expect(() => addPayment(u, 0)).toThrow();
        expect(() => addPayment(u, -3)).toThrow();
        const full = settleFully(u);
        expect(full.isSettled).toBe(true);
        expect(paidAmount(full)).toBe(u.shareAmount);
        const cleared = clearPayments(full);
        expect(remainingAmount(cleared)).toBe(u.shareAmount);
        expect(cleared.isSettled).toBe(false);
      }
    }
  });
});

/* ---------- جمع‌ها و گزارش‌ها ---------- */
function randomWorld(r: R, n: number) {
  const bills: BillWithUnits[] = [];
  for (let i = 0; i < n; i++) {
    let b = makeBill(r);
    b = { ...b, units: b.units.map((u) => (u.shareAmount > 0 && r() < 0.5 ? (r() < 0.5 ? settleFully(u) : addPayment(u, int(r, 1, u.shareAmount))) : u)) };
    b.bill.isFullySettled = b.units.every((u) => u.isSettled);
    if (r() < 0.12 && !b.bill.billPaid) b = { ...b, bill: setBillPaid(b.bill, true, new Date()) };
    bills.push(b);
  }
  return bills;
}

describe('گزارش‌ها و جمع‌ها (۲۰۰ دنیای تصادفی)', () => {
  it('گزارش سالانه: جمع کل = جمع مبالغ؛ جمع انواع و ماه‌ها = جمع کل؛ پرداخت‌شده+مانده = جمع کل', () => {
    const r = rng(31);
    for (let w = 0; w < 200; w++) {
      const bills = randomWorld(r, int(r, 0, 25));
      const active = bills.filter((b) => !b.bill.deletedAt);
      for (const year of [1404, 1405]) {
        const rep = yearlyReport(active, year);
        const mine = active.filter((b) => b.bill.year === year);
        const sum = mine.reduce((s, b) => s + b.bill.totalAmount, 0);
        expect(rep.grandTotal).toBe(sum);
        expect(rep.billCount).toBe(mine.length);
        expect(rep.byType.reduce((s, t) => s + t.total, 0)).toBe(sum);
        expect(rep.byMonth.reduce((s, m) => s + m.total, 0)).toBe(sum);
        expect(rep.settledTotal + rep.unsettledTotal).toBe(sum);
        expect(rep.unsettledTotal).toBe(mine.reduce((s, b) => s + b.units.reduce((a, u) => a + remainingAmount(u), 0), 0));
        for (const t of rep.byType) { expect(t.percent).toBeGreaterThanOrEqual(0); expect(t.percent).toBeLessThanOrEqual(100); }
      }
    }
  });
  it('بدهکاران: جمع کل = مجموع مانده‌ها = جمع بدهی هر واحد؛ تسویه‌شده‌ها نیستند؛ سابقهٔ پرداخت سازگار', () => {
    const r = rng(32);
    for (let w = 0; w < 200; w++) {
      const bills = randomWorld(r, int(r, 0, 25)).filter((b) => !b.bill.deletedAt);
      const rep = debtorsReport(bills, new Date('2026-10-03T00:00:00Z'));
      const owed = bills.reduce((s, b) => s + b.units.reduce((a, u) => a + remainingAmount(u), 0), 0);
      expect(rep.grandTotal).toBe(owed);
      expect(rep.units.reduce((s, u) => s + u.total, 0)).toBe(owed);
      for (const u of rep.units) { expect(u.total).toBeGreaterThan(0); expect(u.items.every((i) => i.amount > 0 && i.amount <= i.share)).toBe(true); }
      for (const n of rep.allUnitNumbers) {
        const h = paymentHistory(bills, n, new Date('2026-10-03T00:00:00Z'));
        expect(h.totalBilled).toBe(h.totalPaid + h.totalOwed);
        expect(rep.units.find((u) => u.unitNumber === n)?.total ?? 0).toBe(h.totalOwed);
      }
    }
  });
  it('حذف نرم: قبض حذف‌شده از گزارش‌ها بیرون است و با بازگردانی دوباره جمع می‌شود؛ قبض «پرداخت شد» حذف نمی‌شود', () => {
    const r = rng(33);
    for (let w = 0; w < 150; w++) {
      const bills = randomWorld(r, int(r, 1, 12));
      const target = bills[int(r, 0, bills.length - 1)];
      const total = (xs: BillWithUnits[]) => yearlyReport(xs, target.bill.year).grandTotal;
      const before = total(bills.filter((b) => !b.bill.deletedAt));
      if (target.bill.billPaid) { expect(() => softDeleteBill(target.bill)).toThrow(); continue; }
      const del = { ...target, bill: softDeleteBill(target.bill) };
      const world2 = bills.map((b) => (b === target ? del : b));
      const after = total(world2.filter((b) => !b.bill.deletedAt));
      expect(after).toBe(before - target.bill.totalAmount);
      const back = { ...del, bill: restoreBill(del.bill) };
      expect(total(world2.map((b) => (b === del ? back : b)).filter((b) => !b.bill.deletedAt))).toBe(before);
    }
  });
  it('انواع خاموش: جمع‌ها فقط انواع فعال را می‌شمارند، همهٔ گزارش‌ها هم‌خوان‌اند و روشن کردن دوباره همه را برمی‌گرداند', () => {
    const r = rng(34);
    for (let w = 0; w < 200; w++) {
      const bills = randomWorld(r, int(r, 0, 25)).filter((b) => !b.bill.deletedAt);
      const on = EXPENSE_TYPE_ORDER.filter(() => r() < 0.6);
      if (on.length === 0) on.push(EXPENSE_TYPE_ORDER[0]);
      const prefs = { ...DEFAULT_ENTRY_PREFS, types: on };
      const vis = visibleBills(bills, prefs);
      expect(vis.every((b) => on.includes(b.bill.expenseType))).toBe(true);
      expect(vis.length).toBe(bills.filter((b) => on.includes(b.bill.expenseType)).length);
      const rep = yearlyReport(vis, 1405, on);
      expect(rep.grandTotal).toBe(vis.filter((b) => b.bill.year === 1405).reduce((s, b) => s + b.bill.totalAmount, 0));
      expect(rep.byType.map((t) => t.type).every((t) => on.includes(t))).toBe(true);
      const owedVisible = vis.reduce((s, b) => s + b.units.reduce((a, u) => a + remainingAmount(u), 0), 0);
      expect(debtorsReport(vis).grandTotal).toBe(owedVisible);
      const f = filterBills(vis, { year: 1405, month: null, type: null, status: 'all' });
      expect(f.every((b) => on.includes(b.bill.expenseType) && b.bill.year === 1405)).toBe(true);
      expect(visibleBills(bills, DEFAULT_ENTRY_PREFS)).toHaveLength(bills.length); // روشن کردن دوباره
    }
  });
});

/* ---------- پشتیبان ---------- */
describe('پشتیبان: رفت‌وبرگشت قالب ۷ (۳۰۰ مورد) و قالب‌های قدیمی', () => {
  it('createBackup ← serialize ← parse: داده‌ها یکسان و جمع‌ها ثابت (از جمله قبض حذف‌شده، پرداخت جزئی، متراژ اعشاری)', () => {
    const r = rng(41);
    for (let w = 0; w < 300; w++) {
      const bills = randomWorld(r, int(r, 1, 10));
      if (r() < 0.4) { const i = int(r, 0, bills.length - 1); if (!bills[i].bill.billPaid) bills[i] = { ...bills[i], bill: softDeleteBill(bills[i].bill) }; }
      const data = { bills: bills.map((b) => b.bill), units: bills.flatMap((b) => b.units), settings: sanitizeSettings(null) };
      const text = serializeBackup(createBackup(data, '1.6.11'));
      expect(JSON.parse(text).backupVersion).toBe(BACKUP_VERSION);
      const p = parseBackup(text);
      expect(p.ok).toBe(true);
      if (!p.ok) continue;
      expect(p.backup.data.bills).toHaveLength(bills.length);
      expect(p.backup.data.units).toHaveLength(data.units.length);
      const back = p.backup.data;
      const keyOf = (u: { billId: string; unitNumber: number }) => u.billId + '#' + u.unitNumber;
      const origUnits = new Map(data.units.map((u) => [keyOf(u), u]));
      for (const u of back.units) {
        const o = origUnits.get(keyOf(u))!;
        expect(u.shareAmount).toBe(o.shareAmount);
        expect(u.personCount).toBe(o.personCount);
        expect(u.vacant === true).toBe(o.vacant === true);
        expect(u.area ?? null).toBe(o.area ?? null);
        expect(remainingAmount(u)).toBe(remainingAmount(o));
        expect(u.isSettled).toBe(o.isSettled);
      }
      for (const b of back.bills) {
        const o = data.bills.find((x) => x.id === b.id)!;
        expect({ ...b, isFullySettled: 0 }).toEqual({ ...o, isFullySettled: 0 });
        expect(back.units.filter((u) => u.billId === b.id).reduce((s, u) => s + u.shareAmount, 0)).toBe(b.totalAmount);
      }
      expect(p.summary.bills).toBe(bills.length);
    }
  });
  it('فایل دستکاری‌شده/خراب رد می‌شود (جمع سهم‌ها، شناسهٔ تکراری، قالب جدیدتر، JSON خراب)', () => {
    const r = rng(42);
    const bills = randomWorld(r, 3);
    const data = { bills: bills.map((b) => b.bill), units: bills.flatMap((b) => b.units), settings: sanitizeSettings(null) };
    const obj = JSON.parse(serializeBackup(createBackup(data, '1.6.11')));
    const mod = (f: (o: any) => void) => { const c = JSON.parse(JSON.stringify(obj)); f(c); return JSON.stringify(c); };
    expect(parseBackup(mod((o) => { o.data.bills[0].totalAmount += 1; })).ok).toBe(false);
    expect(parseBackup(mod((o) => { o.data.bills[1].id = o.data.bills[0].id; })).ok).toBe(false);
    expect(parseBackup(mod((o) => { o.backupVersion = 8; })).ok).toBe(false);
    expect(parseBackup(mod((o) => { o.data.units[0].shareAmount = -1; })).ok).toBe(false);
    expect(parseBackup('{bad').ok).toBe(false);
    expect(parseBackup('').ok).toBe(false);
  });
  it('قالب‌های ۱ تا ۶ (بدون فیلدهای جدید) قابل بازیابی‌اند و پیش‌فرض‌های مهاجرت درست است', () => {
    const r = rng(43);
    let accepted = 0;
    for (let v = 1; v <= 6; v++) {
      for (let w = 0; w < 40; w++) {
        // قبض‌های قدیمی فقط بر اساس نفرات/واحد، بدون متراژ و بدون فیلدهای جدید
        const base = randomWorld(r, int(r, 1, 6)).map((b) => b).filter((b) => b.bill.splitMethod !== 'perArea');
        if (base.length === 0) continue;
        const strip = (o: Record<string, unknown>, keys: string[]) => { for (const k of keys) delete o[k]; return o; };
        const bills = base.map((b) => {
          const o: Record<string, unknown> = { ...b.bill };
          if (v < 4) strip(o, ['billPaid', 'billPaidDate', 'dueDate', 'deletedAt']);
          if (v < 3) strip(o, ['splitMethod']);
          return o;
        });
        const units = base.flatMap((b) => b.units).map((u) => {
          const o: Record<string, unknown> = { ...u };
          if (v < 5) strip(o, ['alias']);
          if (v < 6) strip(o, ['vacant']);
          strip(o, ['area']);
          if (v < 2) strip(o, ['payments']);
          return o;
        });
        // در قالب‌های قدیمی خالی/حذف‌شده/پرداخت‌شده وجود نداشت
        const clean = bills.map((b) => ({ ...b }));
        const file = { app: 'apartemant', backupVersion: v, appVersion: '1.x', createdAt: '2025-01-01T00:00:00.000Z', data: { bills: clean, units, settings: { activeYears: [1404, 1405], showSaveWarning: true, dismissedWarnings: [] }, ...(v >= 2 && v <= 4 ? { unitTemplate: [2, 1] } : {}) } };
        const text = JSON.stringify(file);
        const p = parseBackup(text);
        if (!p.ok) {
          // تنها دلیل مجاز رد شدن: داده‌ای که در آن قالب قابل‌بیان نبود (مثل واحد خالی در قالب <۶ یا حذف‌شده/پرداخت‌شده)
          const hasNew = base.some((b) => b.bill.deletedAt || b.units.some((u) => u.vacant));
          expect(hasNew).toBe(true);
          continue;
        }
        for (const b of p.backup.data.bills) {
          expect(b.billPaid).toBe(v < 4 ? false : b.billPaid);
          if (v < 4) { expect(b.dueDate).toBeNull(); expect(b.deletedAt).toBeNull(); }
          if (v < 3) expect(b.splitMethod ?? 'perPerson').toBe('perPerson');
        }
        accepted++;
        expect(p.backup.data.building?.units.length).toBeGreaterThan(0);
        expect(p.backup.data.bills.map((b) => b.totalAmount)).toEqual(base.map((b) => b.bill.totalAmount));
        // دوباره‌ساخت پشتیبان از داده‌های مهاجرت‌شده به قالب ۷ ثابت و بازیابی‌پذیر است
        const again = parseBackup(serializeBackup(createBackup(p.backup.data, '1.6.11')));
        expect(again.ok).toBe(true);
      }
    }
    expect(accepted).toBeGreaterThan(100); // مطمئن شویم آزمون توخالی نیست
  });
});

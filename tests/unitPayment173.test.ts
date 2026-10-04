import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Bill, BillWithUnits, ExpenseType, Unit } from '../src/models/types';
import { createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import { debtorsReport } from '../src/logic/debts';
import { remainingAmount } from '../src/logic/payments';
import {
  allocateFull, allocateOldestFirst, applyAllocation, listUnitBatches, previewAllocation, undoBatch, unitTotalDebt,
  UnitPayErrors, validateUnitPayAmount, type BillChange,
} from '../src/logic/unitPayment';

// ذخیره‌ساز در حافظه برای آزمون upsertMany
const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { billRepository } = await import('../src/storage/billRepository');

const NOW = new Date('2026-10-04T08:00:00.000Z');
let n = 0;
const bill = (year: number, month: number, type: ExpenseType, created: string, extra: Partial<Bill> = {}): Bill => ({
  id: `b${++n}`, year, month, expenseType: type, billNumber: null, description: null, totalAmount: 1, createdAt: created,
  isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
});
const unit = (b: Bill, unitNumber: number, share: number, extra: Partial<Unit> = {}): Unit => ({
  id: `${b.id}-u${unitNumber}`, billId: b.id, unitNumber, personCount: 1, shareAmount: share, isSettled: false, payments: [], ...extra,
});
/** واحد ۳ در هر قبض share می‌دهد؛ واحد ۱ و ۲ نیز سهم دارند (پرداخت‌نشده) */
const mk = (b: Bill, shares: Record<number, number>): BillWithUnits => ({ bill: { ...b, totalAmount: Object.values(shares).reduce((x, y) => x + y, 0) }, units: Object.entries(shares).map(([u, s]) => unit(b, +u, s)) });

/** مثال تأییدشده: واحد ۳ در سه قبض ۲۰۰ + ۱۵۰ + ۱۵۰ هزار (جمع ۵۰۰ هزار)، به‌صورت درهم‌ریخته */
function scene() {
  const mehr = bill(1405, 7, 'gas', '2026-09-28T08:00:00.000Z');
  const mordad = bill(1405, 5, 'electricity', '2026-08-06T08:00:00.000Z');
  const shahrivar = bill(1405, 6, 'water', '2026-09-06T08:00:00.000Z');
  return { mehr, mordad, shahrivar, data: [mk(mehr, { 1: 100, 3: 150000 }), mk(mordad, { 1: 100, 3: 200000 }), mk(shahrivar, { 1: 100, 3: 150000 })] };
}
const apply = (data: BillWithUnits[], ch: BillChange[]): BillWithUnits[] =>
  data.map((d) => { const c = ch.find((x) => x.bill.id === d.bill.id); return c ? { bill: c.bill, units: c.units } : d; });
const u3 = (data: BillWithUnits[], id: string) => data.find((d) => d.bill.id === id)!.units.find((u) => u.unitNumber === 3)!;

describe('۱.۷.۳ — تخصیص پرداخت بدهی واحد', () => {
  it('کل بدهی = مجموع مانده‌ها (برابر گزارش بدهکاران)', () => {
    const { data } = scene();
    expect(unitTotalDebt(data, 3)).toBe(500000);
    expect(debtorsReport(data).units.find((d) => d.unitNumber === 3)!.total).toBe(500000);
    expect(unitTotalDebt(data, 99)).toBe(0);
  });

  it('تسویه کامل: یک پرداخت برای هر قبض، همه با یک batchId و یک تاریخ؛ بدهی صفر', () => {
    const { data, mordad, shahrivar, mehr } = scene();
    const a = allocateFull(data, 3);
    expect(a).toMatchObject({ mode: 'full', totalDebt: 500000, amount: 500000, remainingDebt: 0, settledCount: 3, partialCount: 0, untouchedCount: 0 });
    expect(a.lines.map((l) => l.billId)).toEqual([mordad.id, shahrivar.id, mehr.id]); // قدیمی‌ترین اول
    const next = apply(data, applyAllocation(data, a, 'batch-1', NOW));
    for (const b of [mordad, shahrivar, mehr]) {
      const u = u3(next, b.id);
      expect(u.isSettled).toBe(true);
      expect(u.payments).toHaveLength(1);
      expect(u.payments![0]).toMatchObject({ batchId: 'batch-1', paidAt: NOW.toISOString() });
    }
    expect(unitTotalDebt(next, 3)).toBe(0);
    expect(debtorsReport(next).units.find((d) => d.unitNumber === 3)).toBeUndefined();
  });

  it('مبلغ جزئی ۳۰۰ از ۵۰۰: مرداد کامل، شهریور جزئی (۵۰ مانده)، مهر دست‌نخورده', () => {
    const { data, mordad, shahrivar, mehr } = scene();
    const a = allocateOldestFirst(data, 3, 300000);
    expect(a.lines.map((l) => [l.pay, l.remainingAfter, l.kind])).toEqual([[200000, 0, 'settled'], [100000, 50000, 'partial'], [0, 150000, 'untouched']]);
    expect(a).toMatchObject({ amount: 300000, remainingDebt: 200000, settledCount: 1, partialCount: 1, untouchedCount: 1 });
    const next = apply(data, applyAllocation(data, a, 'b', NOW));
    expect(remainingAmount(u3(next, mordad.id))).toBe(0);
    expect(remainingAmount(u3(next, shahrivar.id))).toBe(50000);
    expect(u3(next, shahrivar.id).isSettled).toBe(false);
    expect(u3(next, mehr.id).payments).toEqual([]); // دست‌نخورده
    expect(unitTotalDebt(next, 3)).toBe(200000);
    // قبض جزئی در گزارش بدهکاران با «پرداخت جزئی» و مانده می‌ماند
    const items = debtorsReport(next).units.find((d) => d.unitNumber === 3)!.items;
    expect(items.map((i) => [i.billId, i.amount, i.paid])).toEqual([[shahrivar.id, 50000, 100000], [mehr.id, 150000, 0]]);
  });

  it('مبلغ دقیقاً برابر قدیمی‌ترین قبض / دقیقاً کل بدهی / یک تومان', () => {
    const { data } = scene();
    expect(allocateOldestFirst(data, 3, 200000)).toMatchObject({ settledCount: 1, partialCount: 0, untouchedCount: 2, remainingDebt: 300000 });
    expect(allocateOldestFirst(data, 3, 500000)).toMatchObject({ settledCount: 3, partialCount: 0, untouchedCount: 0, remainingDebt: 0 });
    const one = allocateOldestFirst(data, 3, 1);
    expect(one.lines.map((l) => l.pay)).toEqual([1, 0, 0]);
    expect(one.lines[0]).toMatchObject({ kind: 'partial', remainingAfter: 199999 });
    // مجموع تخصیص همیشه برابر مبلغ است
    for (const amt of [1, 199999, 200001, 349999, 350000, 499999]) {
      const a = allocateOldestFirst(data, 3, amt);
      expect(a.lines.reduce((s, l) => s + l.pay, 0)).toBe(amt);
      expect(a.lines.reduce((s, l) => s + l.remainingAfter, 0)).toBe(500000 - amt);
    }
  });

  it('پرداخت بیش از بدهی رد می‌شود (بدون اعتبار)؛ داده تغییری نمی‌کند', () => {
    const { data } = scene();
    const snapshot = JSON.stringify(data);
    expect(() => allocateOldestFirst(data, 3, 500001)).toThrow(UnitPayErrors.tooMuch(500000));
    expect(validateUnitPayAmount(500000, 500001)).toBe(UnitPayErrors.tooMuch(500000));
    expect(previewAllocation(data, 3, 'amount', 500001)).toEqual({ error: UnitPayErrors.tooMuch(500000), allocation: null });
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('مبلغ صفر/منفی/اعشار/خالی/بی‌نهایت معتبر نیست؛ واحد بدون بدهی هم', () => {
    const { data } = scene();
    expect(validateUnitPayAmount(500000, 0)).toBe(UnitPayErrors.invalid);
    expect(validateUnitPayAmount(500000, -5)).toBe(UnitPayErrors.invalid);
    expect(validateUnitPayAmount(500000, 1.5)).toBe(UnitPayErrors.invalid);
    expect(validateUnitPayAmount(500000, Infinity)).toBe(UnitPayErrors.invalid);
    expect(validateUnitPayAmount(500000, null)).toBe(UnitPayErrors.empty);
    expect(validateUnitPayAmount(0, 100)).toBe(UnitPayErrors.noDebt);
    expect(() => allocateOldestFirst(data, 3, 0)).toThrow(UnitPayErrors.invalid);
    expect(() => allocateFull(data, 99)).toThrow(UnitPayErrors.noDebt);
    expect(previewAllocation(data, 99, 'full', null).error).toBe(UnitPayErrors.noDebt);
  });

  it('ترتیب چندساله: ۱۴۰۴/۱۲ قبل از ۱۴۰۵/۱ قبل از ۱۴۰۵/۷؛ برابر ماه ⇒ زمان ثبت؛ همهٔ انواع هزینه', () => {
    const b1 = bill(1405, 7, 'water', '2026-09-30T00:00:00.000Z');
    const b2 = bill(1404, 12, 'gas', '2026-03-10T00:00:00.000Z');
    const b3 = bill(1405, 1, 'building', '2026-04-01T00:00:00.000Z');
    const b4 = bill(1405, 7, 'electricity', '2026-09-20T00:00:00.000Z'); // همان ماه، زودتر ثبت شده
    const data = [mk(b1, { 3: 100 }), mk(b2, { 3: 100 }), mk(b3, { 3: 100 }), mk(b4, { 3: 100 })];
    const a = allocateOldestFirst(data, 3, 250);
    expect(a.lines.map((l) => l.billId)).toEqual([b2.id, b3.id, b4.id, b1.id]);
    expect(a.lines.map((l) => l.pay)).toEqual([100, 100, 50, 0]);
    expect(a.lines.map((l) => l.expenseType)).toEqual(['gas', 'building', 'electricity', 'water']);
    // هم‌ترتیب با گزارش بدهکاران
    expect(debtorsReport(data).units[0].items.map((i) => i.billId)).toEqual(a.lines.map((l) => l.billId));
  });

  it('قبض حذف‌شده، واحد خالی و واحدهای دیگر نادیده/دست‌نخورده‌اند', () => {
    const live = bill(1405, 7, 'water', '2026-09-30T00:00:00.000Z');
    const del = bill(1405, 6, 'gas', '2026-08-30T00:00:00.000Z', { deletedAt: '2026-09-01T00:00:00.000Z' });
    const vac = bill(1405, 5, 'misc', '2026-07-30T00:00:00.000Z');
    const data: BillWithUnits[] = [
      mk(live, { 1: 70, 3: 100 }), mk(del, { 3: 900 }),
      { bill: vac, units: [unit(vac, 3, 800, { vacant: true }), unit(vac, 1, 5)] },
    ];
    expect(unitTotalDebt(data, 3)).toBe(100);
    const next = apply(data, applyAllocation(data, allocateFull(data, 3), 'x', NOW));
    expect(next[0].units.find((u) => u.unitNumber === 1)).toEqual(data[0].units.find((u) => u.unitNumber === 1)); // واحد ۱ دست‌نخورده
    expect(next[1]).toBe(data[1]); // حذف‌شده
    expect(next[2]).toBe(data[2]);
  });

  it('ورودی تغییر نمی‌کند (ایمن) و فقط قبض‌های پرداخت‌دار برگردانده می‌شوند', () => {
    const { data } = scene();
    const snapshot = JSON.stringify(data);
    const ch = applyAllocation(data, allocateOldestFirst(data, 3, 300000), 'b', NOW);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(ch).toHaveLength(2);
  });

  it('قفل قبض: فقط وقتی همهٔ واحدهای قبض تسویه شوند', () => {
    const solo = bill(1405, 4, 'water', '2026-07-01T00:00:00.000Z');
    const shared = bill(1405, 5, 'gas', '2026-08-01T00:00:00.000Z');
    const data = [mk(solo, { 3: 100 }), mk(shared, { 3: 100, 1: 100 })];
    const a = allocateFull(data, 3);
    expect(a.lines.map((l) => l.locksBill)).toEqual([true, false]);
    expect(a.locksCount).toBe(1);
    const ch = applyAllocation(data, a, 'b', NOW);
    expect(ch.find((c) => c.bill.id === solo.id)!.bill.isFullySettled).toBe(true);
    expect(ch.find((c) => c.bill.id === shared.id)!.bill.isFullySettled).toBe(false);
  });

  it('لغو: دقیقاً به وضعیت قبل برمی‌گردد، قفل باز می‌شود و پرداخت‌های دیگر می‌مانند', () => {
    const solo = bill(1405, 4, 'water', '2026-07-01T00:00:00.000Z');
    const shared = bill(1405, 5, 'gas', '2026-08-01T00:00:00.000Z');
    const base = [mk(solo, { 3: 100 }), mk(shared, { 3: 100, 1: 100 })];
    // یک پرداخت قبلی (دستی، بدون batchId) روی قبض مشترک
    base[1].units[0] = { ...base[1].units[0], payments: [{ id: 'old', amount: 30, paidAt: '2026-09-01T00:00:00.000Z' }], isSettled: false };
    const before = JSON.parse(JSON.stringify(base));
    const paid = apply(base, applyAllocation(base, allocateFull(base, 3), 'B1', NOW));
    expect(paid[0].bill.isFullySettled).toBe(true);
    const undone = apply(paid, undoBatch(paid, 'B1'));
    expect(undone).toEqual(before);
    expect(undone[0].bill.isFullySettled).toBe(false);
    expect(undone[0].units[0].isSettled).toBe(false);
    expect(undone[1].units[0].payments).toEqual([{ id: 'old', amount: 30, paidAt: '2026-09-01T00:00:00.000Z' }]);
    expect(undoBatch(undone, 'B1')).toEqual([]); // تکرار لغو بی‌اثر
    expect(undoBatch(undone, 'nope')).toEqual([]);
  });

  it('لغو یک عملیات، عملیات دیگر را دست نمی‌زند؛ سابقهٔ دسته‌ها جدیدترین اول', () => {
    const { data } = scene();
    const s1 = apply(data, applyAllocation(data, allocateOldestFirst(data, 3, 100000), 'B1', new Date('2026-10-01T08:00:00.000Z')));
    const s2 = apply(s1, applyAllocation(s1, allocateOldestFirst(s1, 3, 150000), 'B2', new Date('2026-10-04T08:00:00.000Z')));
    expect(listUnitBatches(s2, 3).map((b) => [b.batchId, b.total, b.billCount])).toEqual([['B2', 150000, 2], ['B1', 100000, 1]]);
    const after = apply(s2, undoBatch(s2, 'B2'));
    expect(listUnitBatches(after, 3).map((b) => b.batchId)).toEqual(['B1']);
    expect(unitTotalDebt(after, 3)).toBe(400000);
    expect(listUnitBatches(after, 1)).toEqual([]);
  });

  it('تسویه‌های قدیمی (بدون payments / تسویه با isSettled) با لغو دست نمی‌خورند', () => {
    const b = bill(1405, 4, 'water', '2026-07-01T00:00:00.000Z');
    const legacy: BillWithUnits = { bill: b, units: [{ id: 'l', billId: b.id, unitNumber: 3, personCount: 1, shareAmount: 50, isSettled: true }] };
    expect(undoBatch([legacy], 'X')).toEqual([]);
    expect(unitTotalDebt([legacy], 3)).toBe(0);
  });
});

describe('۱.۷.۳ — ذخیره‌سازی و پشتیبان', () => {
  beforeEach(() => { mem.clear(); });

  it('upsertMany: چند قبض با یک نوشتن؛ نتیجه با getAll دیده می‌شود؛ لغو هم از طریق مخزن', async () => {
    const { data } = scene();
    for (const d of data) await billRepository.upsert(d.bill, d.units);
    const all = await billRepository.getAll();
    await billRepository.upsertMany(applyAllocation(all, allocateOldestFirst(all, 3, 300000), 'R1', NOW));
    const mid = await billRepository.getAll();
    expect(unitTotalDebt(mid, 3)).toBe(200000);
    expect(mid).toHaveLength(3);
    await billRepository.upsertMany(undoBatch(await billRepository.getAllWithDeleted(), 'R1'));
    const end = await billRepository.getAll();
    expect(unitTotalDebt(end, 3)).toBe(500000);
    await billRepository.upsertMany([]); // خالی: بی‌اثر
    expect(await billRepository.getAll()).toHaveLength(3);
  });

  const settings: AppSettings = { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] };
  it('رفت‌وبرگشت پشتیبان با batchId؛ لغو بعد از بازیابی کار می‌کند', () => {
    const { data } = scene();
    const paid = apply(data, applyAllocation(data, allocateOldestFirst(data, 3, 300000), 'KEEP-ME', NOW));
    const text = serializeBackup(createBackup({ bills: paid.map((d) => d.bill), units: paid.flatMap((d) => d.units), settings }, '1.7.3', NOW));
    expect(text).toContain('KEEP-ME');
    const r = parseBackup(text);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    if (!r.ok) return;
    expect(r.backup.data.units.filter((u) => u.payments?.some((p) => p.batchId === 'KEEP-ME'))).toHaveLength(2);
    const restored: BillWithUnits[] = r.backup.data.bills.map((b) => ({ bill: b, units: r.backup.data.units.filter((u) => u.billId === b.id) }));
    expect(listUnitBatches(restored, 3)).toMatchObject([{ batchId: 'KEEP-ME', total: 300000, billCount: 2 }]);
    expect(unitTotalDebt(restored, 3)).toBe(200000);
    expect(unitTotalDebt(apply(restored, undoBatch(restored, 'KEEP-ME')), 3)).toBe(500000);
  });

  it('پشتیبان‌های قدیمی (بدون batchId) بدون تغییر بازیابی می‌شوند؛ batchId نامعتبر رد می‌شود', () => {
    const { data } = scene();
    const withOld = data.map((d) => ({ ...d, units: d.units.map((u) => (u.unitNumber === 3 ? { ...u, payments: [{ id: 'p-' + u.id, amount: 10, paidAt: null }], isSettled: false } : u)) }));
    const raw = serializeBackup(createBackup({ bills: withOld.map((d) => d.bill), units: withOld.flatMap((d) => d.units), settings }, '1.7.2', NOW));
    expect(raw).not.toContain('batchId');
    const r = parseBackup(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.data.units).toEqual(withOld.flatMap((d) => d.units));
      expect(r.backup.data.units.every((u) => u.payments?.every((p) => !('batchId' in p)) ?? true)).toBe(true);
    }
    const obj = JSON.parse(raw);
    obj.data.units.find((u: any) => u.unitNumber === 3).payments[0].batchId = 12345;
    expect(parseBackup(JSON.stringify(obj)).ok).toBe(false);
    obj.data.units.find((u: any) => u.unitNumber === 3).payments[0].batchId = null; // null = بدون دسته
    const ok = parseBackup(JSON.stringify(obj));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect('batchId' in ok.backup.data.units.find((u) => u.unitNumber === 3)!.payments![0]).toBe(false);
  });
});

describe('۱.۷.۳ — رابط: ردیف بدهکاران یک‌خطی و مسیرها', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('دکمهٔ «پرداخت» کنار «سابقه پرداخت» (برچسب کوتاه) در یک ردیف بدون شکست خط', () => {
    const v = read('src/screens/reports/DebtorsView.tsx');
    expect(v).toMatch(/className="debtor__actions"/);
    expect(v).toContain('onPayUnit(d.unitNumber)');
    expect(v).toMatch(/>\s*سابقه پرداخت\s*<\/button>/);
    expect(v).not.toMatch(/سابقه پرداخت\s*<UnitName/);
    const css = read('src/styles/global.css');
    expect(css).toMatch(/\.debtor__actions \{[^}]*flex-wrap: nowrap/);
    expect(css).toMatch(/\.debtor__actions \.btn \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.debtor__history \{[^}]*min-width: 0/);
  });
  it('مسیر unitPay در ناوبری، App و گزارش‌ها وصل است و صفحه از AppHeader مشترک استفاده می‌کند', () => {
    expect(read('src/navigation.ts')).toContain("name: 'unitPay'");
    const app = read('src/App.tsx');
    expect(app).toContain("case 'unitPay'");
    expect(app).toContain("push({ name: 'unitPay', unitNumber })");
    expect(read('src/screens/ReportsScreen.tsx')).toContain('onPayUnit={onPayUnit}');
    const s = read('src/screens/UnitPaymentScreen.tsx');
    expect(s).toContain('<AppHeader');
    expect(s).toContain('upsertMany');
    expect(s).toContain('لغو این پرداخت');
    expect(read('src/screens/UnitHistoryScreen.tsx')).toContain('listUnitBatches');
  });
});

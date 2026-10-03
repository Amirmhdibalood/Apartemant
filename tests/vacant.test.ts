import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits, Unit } from '../src/models/types';
import { calculateBySplit, splitWeights } from '../src/logic/split';
import { buildBill, draftFromBill, emptyDraft } from '../src/logic/billFactory';
import { buildingFromBills, sanitizeBuilding } from '../src/logic/building';
import { debtorsReport, paymentHistory } from '../src/logic/debts';
import { buildBillImageModel } from '../src/logic/billImage';
import { createBackup, parseBackup, serializeBackup, BACKUP_VERSION, type BackupData } from '../src/logic/backup';
import { validateDraft } from '../src/logic/validation';

describe('واحد خالی در تقسیم', () => {
  it('وزن واحد خالی در هر دو روش صفر است', () => {
    expect(splitWeights([3, 2, 4], 'perPerson', [false, true, false])).toEqual([3, 0, 4]);
    expect(splitWeights([3, 2, 4], 'perUnit', [false, true, false])).toEqual([1, 0, 1]);
    expect(splitWeights([3, 2, 4], 'perUnit')).toEqual([1, 1, 1]);
  });

  it('بر اساس نفرات: نفرات واحد خالی شمرده نمی‌شود؛ جمع سهم‌ها = مبلغ', () => {
    const r = calculateBySplit(700000, [3, 5, 4], 'perPerson', [false, true, false]);
    expect(r.totalPersons).toBe(7);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([300000, 0, 400000]);
    expect(r.shares[1].personCount).toBe(5); // نفرات واقعی دست‌نخورده می‌ماند
  });

  it('بر اساس واحد: واحد خالی شمرده نمی‌شود', () => {
    const r = calculateBySplit(100001, [3, 5, 4], 'perUnit', [true, false, false]);
    expect(r.totalPersons).toBe(2);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([0, 50001, 50000]);
    expect(r.shares.reduce((a, s) => a + s.shareAmount, 0)).toBe(100001);
  });

  it('بدون vacant رفتار قبلی حفظ می‌شود', () => {
    const r = calculateBySplit(90000, [1, 1, 1], 'perUnit');
    expect(r.shares.map((s) => s.shareAmount)).toEqual([30000, 30000, 30000]);
  });
});

describe('عکس لحظه‌ای قبض با واحد خالی', () => {
  const building = sanitizeBuilding({ units: [{ alias: 'الف', defaultPersons: 2 }, { alias: null, defaultPersons: 3, vacant: true }, { alias: null, defaultPersons: 1 }] })!;
  const draft = { ...emptyDraft(1405, 7, building), expenseType: 'water' as const, amountDigits: '300000' };

  it('فرم قبض جدید واحد خالی را از پیش کنار می‌گذارد و نفرات پیش‌فرض را نگه می‌دارد', () => {
    expect(draft.unitVacant).toEqual([false, true, false]);
    expect(draft.personCounts).toEqual(['2', '3', '1']);
  });

  it('ذخیره: vacant در Unit، سهم ۰، تسویه‌شده؛ ویرایش از روی عکس لحظه‌ای', () => {
    const v = validateDraft(draft);
    if (!v.ok) throw new Error('invalid');
    const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, 'perPerson', v.value.vacant);
    const saved = buildBill(draft, calc, null, new Date('2026-09-28T08:00:00Z'));
    expect(saved.units.map((u) => [u.shareAmount, u.vacant === true, u.isSettled])).toEqual([[200000, false, false], [0, true, true], [100000, false, false]]);
    expect(draftFromBill(saved).unitVacant).toEqual([false, true, false]);
    // تغییر تنظیمات ساختمان بعداً روی قبض اثری ندارد
    expect(sanitizeBuilding({ units: [{ alias: null, defaultPersons: 3 }] })!.units[0].vacant).toBeUndefined();
    expect(saved.units[1].vacant).toBe(true);
  });

  it('override فقط برای همان قبض: خالی را در فرم خاموش کنیم، در قبض سهم می‌گیرد و تنظیمات عوض نمی‌شود', () => {
    const d2 = { ...draft, unitVacant: [false, false, false] };
    const v = validateDraft(d2);
    if (!v.ok) throw new Error('invalid');
    const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, 'perPerson', v.value.vacant);
    expect(calc.shares.map((s) => s.shareAmount)).toEqual([100000, 150000, 50000]);
    expect(building.units[1].vacant).toBe(true);
  });

  it('تنظیمات ساختمان از روی جدیدترین قبض: خالی بودن حفظ می‌شود', () => {
    const v = validateDraft(draft);
    if (!v.ok) throw new Error('invalid');
    const saved = buildBill(draft, calculateBySplit(v.value.totalAmount, v.value.personCounts, 'perPerson', v.value.vacant), null);
    expect(buildingFromBills([saved]).units.map((u) => u.vacant === true)).toEqual([false, true, false]);
  });
});

describe('گزارش‌ها و تصویر قبض', () => {
  const bill: Bill = { id: 'b', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 300000, createdAt: '2026-09-20T08:00:00.000Z', isFullySettled: false };
  const units: Unit[] = [
    { id: 'u1', billId: 'b', unitNumber: 1, personCount: 2, shareAmount: 150000, isSettled: false },
    { id: 'u2', billId: 'b', unitNumber: 2, personCount: 3, vacant: true, shareAmount: 0, isSettled: true },
    { id: 'u3', billId: 'b', unitNumber: 3, personCount: 2, shareAmount: 150000, isSettled: false },
  ];
  const data: BillWithUnits[] = [{ bill, units }];

  it('واحد خالی در بدهکاران و سابقه پرداخت نیست', () => {
    const r = debtorsReport(data, new Date('2026-09-26T08:00:00Z'));
    expect(r.units.map((u) => u.unitNumber)).toEqual([1, 3]);
    expect(paymentHistory(data, 2, new Date('2026-09-26T08:00:00Z')).entries).toEqual([]);
  });

  it('تصویر قبض: وضعیت «خالی»', () => {
    const m = buildBillImageModel(data[0], new Date('2026-09-26T08:00:00Z'));
    expect(m.rows[1].status.text).toBe('خالی');
    expect(m.rows[1].occupants).toBe('—');
  });
});

describe('پشتیبان قالب ۶: پرچم خالی', () => {
  const sample = (): BackupData => ({
    bills: [{ id: 'b', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 300000, createdAt: '2026-09-20T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null }],
    units: [
      { id: 'u1', billId: 'b', unitNumber: 1, personCount: 2, shareAmount: 300000, isSettled: false },
      { id: 'u2', billId: 'b', unitNumber: 2, personCount: 3, vacant: true, shareAmount: 0, isSettled: true },
    ],
    settings: { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] },
    building: { units: [{ alias: null, defaultPersons: 2 }, { alias: null, defaultPersons: 3, vacant: true }] },
  });
  const make = (mut?: (o: any) => void) => { const o = JSON.parse(serializeBackup(createBackup(sample(), '1.6.3', new Date()))); mut?.(o); return JSON.stringify(o); };

  it('نسخه ۶ و رفت‌وبرگشت کامل', () => {
    expect(BACKUP_VERSION).toBe(6);
    const r = parseBackup(make());
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.units[1].vacant).toBe(true);
    expect(r.backup.data.units[0].vacant).toBeUndefined();
    expect(r.backup.data.building).toEqual(sample().building);
  });

  it('فایل قالب ۵ (بدون پرچم) بازیابی می‌شود: خالی نیست؛ فقط «نفرات پیش‌فرض ۰» به خالی تبدیل می‌شود', () => {
    const r = parseBackup(make((o) => {
      o.backupVersion = 5;
      for (const u of o.data.units) delete u.vacant;
      o.data.units[1].personCount = 0;
      o.data.building = { units: [{ alias: null, defaultPersons: 2 }, { alias: null, defaultPersons: 0 }] };
    }));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.units.every((u) => u.vacant === undefined)).toBe(true);
    expect(r.backup.data.building).toEqual({ units: [{ alias: null, defaultPersons: 2 }, { alias: null, defaultPersons: 1, vacant: true }] });
  });

  it('پرچم نامعتبر یا واحد خالی دارای سهم رد می‌شود', () => {
    expect(parseBackup(make((o) => { o.data.units[1].vacant = 'yes'; })).ok).toBe(false);
    expect(parseBackup(make((o) => { o.data.units[0].vacant = true; })).ok).toBe(false);
    expect(parseBackup(make((o) => { o.data.building.units[0].vacant = 1; })).ok).toBe(false);
  });
});

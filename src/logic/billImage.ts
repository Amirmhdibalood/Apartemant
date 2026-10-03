/**
 * مدل داده «تصویر قبض» برای اشتراک‌گذاری (مثلاً در گروه تلگرام ساختمان) — منطق خالص و قابل تست.
 * رسم روی canvas در services/billImage.ts انجام می‌شود.
 */
import type { BillWithUnits, SplitMethod } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, SPLIT_METHOD_LABELS, monthName } from '../models/constants';
import { formatAmount, toPersianDigits } from './formatting';
import { splitMethodOf } from './split';
import { paidAmount, remainingAmount } from './payments';
import { jalaliDateTime, jalaliIsoDate } from './date';
import { sanitizeAlias, unitShortLabel } from './building';
import { formatArea, parseArea, sumAreas } from './area';
import { occupantTotal, occupiedCount, VACANT_LABEL } from './vacant';

export const APP_NAME_FA = 'آپارتمانت';

export type UnitStatusKind = 'settled' | 'partial' | 'unpaid';

export interface BillImageRow {
  /** شماره واحد (ارقام فارسی) */
  unit: string;
  /** اسم مستعار واحد در همین قبض (عکس لحظه‌ای) یا null */
  alias: string | null;
  /** برچسب کامل ستون واحد: «۱» یا «۱ - آقای رضایی» */
  unitLabel: string;
  /** تعداد نفرات (ارقام فارسی) — فقط در تقسیم «بر اساس نفرات» نمایش داده می‌شود */
  occupants: string;
  /** متراژ واحد (ارقام فارسی) — فقط در تقسیم «بر اساس متراژ» */
  area: string;
  /** سهم واحد (ارقام فارسی با جداکننده) */
  share: string;
  status: { kind: UnitStatusKind; text: string };
}

export interface BillImageModel {
  appName: string;
  typeLabel: string;
  typeColor: string;
  typeBg: string;
  typeIconBg: string;
  /** مثل «مهر ۱۴۰۵» */
  period: string;
  /** مثل «۱۲٬۵۰۰٬۰۰۰» */
  total: string;
  currency: string;
  splitMethod: SplitMethod;
  splitLabel: string;
  /** ستون «نفرات» نمایش داده شود؟ (فقط بر اساس نفرات) */
  showOccupants: boolean;
  /** ستون «متراژ» نمایش داده شود؟ (فقط بر اساس متراژ) */
  showArea: boolean;
  /** جمع متراژ واحدهای غیرخالی (ارقام فارسی، مثل «۳۰۰») */
  totalArea: string;
  /** ستون «وضعیت» نمایش داده شود؟ (فقط وقتی حداقل یک پرداخت ثبت شده) */
  showStatus: boolean;
  rows: BillImageRow[];
  /** حداقل یک واحد اسم مستعار دارد (ستون واحد پهن‌تر می‌شود) */
  hasAliases: boolean;
  /** جمع نفرات یا تعداد واحدها (ارقام فارسی) */
  totalPersons: string;
  unitCount: string;
  /** مثل «سهم هر نفر: ۲۵۰٬۰۰۰ تومان» یا null */
  perShareLine: string | null;
  billNumber: string | null;
  description: string | null;
  /** مثل «تاریخ: ۱۴۰۵/۰۷/۰۵» (تاریخ تهیه تصویر) */
  dateLine: string;
  /** وضعیت کلی قبض */
  settledLine: string | null;
  /** نام فایل PNG (ارقام انگلیسی، بدون فاصله) */
  fileName: string;
}

/** ارقام فارسی + جداکننده هزارگان فارسی «٬» */
export function faAmount(value: number): string {
  return toPersianDigits(formatAmount(value)).replace(/,/g, '٬');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function faDate(date: Date): string {
  const j = jalaliDateTime(date);
  if (!j) return toPersianDigits(date.toISOString().slice(0, 10).replace(/-/g, '/'));
  return toPersianDigits(`${j.year}/${pad2(j.month)}/${pad2(j.day)}`);
}

export function buildBillImageModel({ bill, units }: BillWithUnits, now: Date = new Date()): BillImageModel {
  const type = EXPENSE_TYPES[bill.expenseType] ?? EXPENSE_TYPES.misc;
  const method = splitMethodOf(bill);
  const sorted = [...units].sort((a, b) => a.unitNumber - b.unitNumber);
  const anyPayment = sorted.some((u) => paidAmount(u) > 0);

  const rows: BillImageRow[] = sorted.map((u) => {
    const paid = paidAmount(u);
    const remaining = remainingAmount(u);
    let status: BillImageRow['status'];
    if (u.shareAmount === 0) status = { kind: 'settled', text: u.vacant ? 'خالی' : 'بدون سهم' };
    else if (remaining === 0) status = { kind: 'settled', text: 'تسویه' };
    else if (paid > 0) status = { kind: 'partial', text: `مانده ${faAmount(remaining)}` };
    else status = { kind: 'unpaid', text: 'پرداخت‌نشده' };
    return {
      unit: toPersianDigits(u.unitNumber),
      alias: sanitizeAlias(u.alias),
      unitLabel: unitShortLabel(u.unitNumber, u.alias),
      occupants: u.vacant ? VACANT_LABEL : toPersianDigits(u.personCount),
      area: u.vacant ? VACANT_LABEL : parseArea(u.area ?? null) !== null ? formatArea(u.area as number) : '—',
      share: faAmount(u.shareAmount),
      status,
    };
  });

  // واحد خالی نه واحد حساب می‌شود نه نفراتش
  const persons = occupantTotal(sorted);
  const occupied = occupiedCount(sorted);
  let perShareLine: string | null = null;
  if (method === 'perPerson' && persons > 0) {
    perShareLine = `سهم هر نفر: ${faAmount(Math.round(bill.totalAmount / persons))} ${CURRENCY}`;
  } else if (method === 'perUnit' && occupied > 0) {
    perShareLine = `سهم هر واحد: ${faAmount(Math.round(bill.totalAmount / occupied))} ${CURRENCY}`;
  }

  const totalAreaM2 = sumAreas(sorted.map((u) => u.area), sorted.map((u) => u.vacant === true));
  if (method === 'perArea' && totalAreaM2 > 0) {
    perShareLine = `قیمت هر مترمربع: ${faAmount(Math.round(bill.totalAmount / totalAreaM2))} ${CURRENCY}`;
  }

  const allSettled = sorted.length > 0 && rows.every((r) => r.status.kind === 'settled');
  const fileName = `apartemant-${bill.expenseType}-${bill.year}-${pad2(bill.month)}-${jalaliIsoDate(now).replace(/-/g, '')}.png`;

  return {
    appName: APP_NAME_FA,
    typeLabel: type.label,
    typeColor: type.color,
    typeBg: type.bg,
    typeIconBg: type.iconBg,
    period: `${monthName(bill.month)} ${toPersianDigits(bill.year)}`,
    total: faAmount(bill.totalAmount),
    currency: CURRENCY,
    splitMethod: method,
    splitLabel: SPLIT_METHOD_LABELS[method],
    showOccupants: method === 'perPerson',
    showArea: method === 'perArea',
    totalArea: formatArea(totalAreaM2),
    showStatus: anyPayment,
    rows,
    hasAliases: rows.some((r) => r.alias !== null),
    totalPersons: toPersianDigits(persons),
    unitCount: toPersianDigits(occupied),
    perShareLine,
    billNumber: bill.billNumber ? toPersianDigits(bill.billNumber) : null,
    description: bill.description?.trim() ? bill.description.trim() : null,
    dateLine: `تاریخ: ${faDate(now)}`,
    settledLine: anyPayment ? (allSettled ? 'همه واحدها تسویه کرده‌اند' : null) : null,
    fileName,
  };
}

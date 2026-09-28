/** هشدار کم کردن تعداد واحدهای ساختمان وقتی واحدهای حذف‌شونده هنوز بدهی دارند (تأیید = مجاز) */
import { billRepository } from '../storage/billRepository';
import { debtsBeyondUnitCount, unitLabel } from '../logic/building';
import { formatAmount, toPersianDigits } from '../logic/formatting';
import { CURRENCY } from '../models/constants';

type Confirm = (o: { title: string; text: string; confirmLabel: string; tone?: 'danger' | 'warning' }) => Promise<boolean>;

export async function confirmUnitReduction(newCount: number, confirm: Confirm): Promise<boolean> {
  const bills = await billRepository.getAll().catch(() => []);
  const debts = debtsBeyondUnitCount(bills, newCount);
  if (debts.length === 0) return true;
  const lines = debts.slice(0, 6).map((d) => `• ${unitLabel(d.unitNumber, d.alias)}: ${toPersianDigits(formatAmount(d.amount)).replace(/,/g, '٬')} ${CURRENCY}`);
  if (debts.length > 6) lines.push('• …');
  return confirm({
    title: debts.length === 1 ? 'این واحد هنوز بدهی دارد' : 'این واحدها هنوز بدهی دارند',
    text:
      `${lines.join('\n')}\n\nبا کم کردن تعداد واحدها، ${debts.length === 1 ? 'این واحد در قبض‌های جدید نمی‌آید' : 'این واحدها در قبض‌های جدید نمی‌آیند'}؛ ` +
      'اما بدهی‌ها و پرداخت‌های قبلی در قبض‌ها و گزارش‌ها باقی می‌ماند. ادامه می‌دهید؟',
    confirmLabel: 'ادامه',
    tone: 'warning',
  });
}

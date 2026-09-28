import { useEffect, useState } from 'react';
import { UnitName } from './UnitName';
import type { Unit } from '../models/types';
import { CURRENCY } from '../models/constants';
import { Dialog } from './Dialog';
import { AmountInput } from './AmountInput';
import { formatAmount, parseAmount } from '../logic/formatting';
import { PaymentErrors, paidAmount, remainingAmount, validatePayment } from '../logic/payments';

interface Props {
  unit: Unit | null;
  onClose: () => void;
  onSettleFully: (unit: Unit) => void;
  onPay: (unit: Unit, amount: number) => void;
  /** فقط برای واحد دارای پرداخت در قبض قفل‌نشده */
  onClear?: (unit: Unit) => void;
}

/**
 * پنجره «پرداخت» یک واحد: «تسویه کامل» (کل مانده) یا «پرداخت مبلغ» (پرداخت جزئی).
 * تاریخ پرداخت خودکار ثبت می‌شود و اینجا نمایش داده نمی‌شود (فقط در گزارش‌ها).
 */
export function PaymentDialog({ unit, onClose, onSettleFully, onPay, onClear }: Props) {
  const [mode, setMode] = useState<'choose' | 'amount'>('choose');
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMode('choose'); setDigits(''); setError(null); }, [unit?.id]);
  if (!unit) return null;

  const remaining = remainingAmount(unit);
  const paid = paidAmount(unit);
  const typed = parseAmount(digits);
  const after = typed !== null && typed > 0 && typed <= remaining ? remaining - typed : null;

  const submit = () => {
    const err = digits !== '' && typed === null ? PaymentErrors.invalid : validatePayment(unit, typed);
    if (err) { setError(err); return; }
    onPay(unit, typed!);
  };

  return (
    <Dialog open onClose={onClose} labelledBy="pay-title">
      <h2 id="pay-title" className="dialog__title">پرداخت <UnitName n={unit.unitNumber} alias={unit.alias} /></h2>
      <div className="pay-summary">
        <div><span>سهم واحد</span><b className="num">{formatAmount(unit.shareAmount)}</b></div>
        <div><span>پرداخت‌شده</span><b className="num">{formatAmount(paid)}</b></div>
        <div className={remaining > 0 ? 'is-due' : 'is-ok'}><span>مانده</span><b className="num">{formatAmount(remaining)}</b></div>
      </div>

      {remaining === 0 ? (
        <>
          <p className="dialog__text pay-done">این واحد تسویه شده است.</p>
          <div className="dialog__actions dialog__actions--two">
            {onClear && (
              <button type="button" className="btn btn--danger-soft" onClick={() => onClear(unit)}>برگرداندن به پرداخت‌نشده</button>
            )}
            <button type="button" className="btn btn--muted" onClick={onClose}>بستن</button>
          </div>
        </>
      ) : mode === 'choose' ? (
        <div className="pay-options">
          <button type="button" className="pay-option pay-option--full" onClick={() => onSettleFully(unit)}>
            <span className="pay-option__title">تسویه کامل</span>
            <span className="pay-option__hint">پرداخت کل مانده: <b className="num">{formatAmount(remaining)}</b> {CURRENCY}</span>
          </button>
          <button type="button" className="pay-option" onClick={() => setMode('amount')}>
            <span className="pay-option__title">پرداخت مبلغ</span>
            <span className="pay-option__hint">پرداخت بخشی از بدهی (مبلغ را وارد کنید)</span>
          </button>
          {onClear && paid > 0 && (
            <button type="button" className="pay-clear" onClick={() => onClear(unit)}>حذف پرداخت‌های ثبت‌شده این واحد</button>
          )}
          <button type="button" className="btn btn--muted btn--block" onClick={onClose}>انصراف</button>
        </div>
      ) : (
        <div className="pay-amount">
          <label className="field__label" htmlFor="pay-amount">مبلغ پرداخت</label>
          <AmountInput
            id="pay-amount"
            digits={digits}
            onChange={(d) => { setDigits(d); setError(null); }}
            placeholder={formatAmount(remaining)}
            suffix={CURRENCY}
          />
          {error ? (
            <p className="pay-error" role="alert">{error}</p>
          ) : (
            <p className="pay-after">
              مانده پس از این پرداخت: <b className="num">{after === null ? '—' : formatAmount(after)}</b> {after !== null && CURRENCY}
              {after === 0 && <span className="pay-after__ok"> (تسویه)</span>}
            </p>
          )}
          <div className="dialog__actions dialog__actions--two">
            <button type="button" className="btn btn--primary" onClick={submit}>ثبت پرداخت</button>
            <button type="button" className="btn btn--muted" onClick={() => { setMode('choose'); setError(null); }}>بازگشت</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

import { useLayoutEffect, useRef } from 'react';
import { groupDigits, reformatAmountInput } from '../logic/formatting';

interface Props {
  id?: string;
  /** فقط ارقام انگلیسی بدون کاما */
  digits: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  suffix?: string;
}

/**
 * فیلد مبلغ با جداکننده هزارگان زنده.
 * state فقط «ارقام خام» است (نه متن فرمت‌شده و نه Number)، بنابراین فرمت کردن
 * هیچ‌وقت ورودی را خراب نمی‌کند و می‌توان هر تعداد رقم پشت‌سرهم تایپ کرد.
 * موقعیت مکان‌نما پس از هر فرمت بازیابی می‌شود. ارقام فارسی/عربی کیبورد نیز
 * به ارقام انگلیسی تبدیل می‌شوند.
 */
export function AmountInput({ id, digits, onChange, placeholder, suffix }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = groupDigits(digits);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pendingCaret.current != null && document.activeElement === el) {
      const pos = pendingCaret.current;
      el.setSelectionRange(pos, pos);
    }
    pendingCaret.current = null;
  });

  return (
    <div className="input-wrap">
      <input
        id={id}
        ref={ref}
        className="input input--amount"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const el = e.target;
          const res = reformatAmountInput(el.value, el.selectionStart ?? el.value.length);
          pendingCaret.current = res.caret;
          // اگر متن تغییری نکرد (مثلاً کاراکتر غیرعددی تایپ شد) مقدار DOM را اصلاح می‌کنیم
          if (res.digits === digits && el.value.length < display.length && digits.length > 0) {
            // فقط یک کاما حذف شده است (Backspace/Delete روی جداکننده): رقم مجاور را حذف کن
            const k = res.display.slice(0, res.caret).replace(/[^0-9]/g, '').length;
            const forward = (e.nativeEvent as InputEvent).inputType === 'deleteContentForward';
            const next = forward
              ? digits.slice(0, k) + digits.slice(k + 1)
              : digits.slice(0, Math.max(0, k - 1)) + digits.slice(k);
            const fixed = reformatAmountInput(next, forward ? k : Math.max(0, k - 1));
            pendingCaret.current = fixed.caret;
            onChange(fixed.digits);
          } else if (res.digits === digits) {
            el.value = res.display;
            el.setSelectionRange(res.caret, res.caret);
          } else {
            onChange(res.digits);
          }
        }}
      />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  );
}

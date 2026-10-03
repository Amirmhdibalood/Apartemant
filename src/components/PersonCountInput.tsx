import { sanitizePersonCount } from '../logic/formatting';

interface Props {
  value: string;
  onChange: (v: string) => void;
  unitNumber: number;
  invalid?: boolean;
  /** «بر اساس واحد»: نمایش ۱ کم‌رنگ و غیرقابل ویرایش (مقدار واقعی دست‌نخورده می‌ماند) */
  disabled?: boolean;
  /** با disabled: به‌جای مقدار واقعی، ۱ (وزن) نشان بده؛ برای واحد خالی false است تا نفرات واقعی دیده شود */
  showWeight?: boolean;
}

/** ورودی تعداد نفرات: فقط تایپ دستی، بدون Spinner (type=text + inputMode=numeric) */
export function PersonCountInput({ value, onChange, unitNumber, invalid, disabled, showWeight = true }: Props) {
  return (
    <input
      className={'input input--count' + (invalid ? ' is-invalid' : '') + (disabled ? ' is-weight' : '')}
      disabled={disabled}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      dir="ltr"
      maxLength={4}
      value={disabled && showWeight ? '1' : value}
      aria-label={`تعداد نفرات واحد ${unitNumber}`}
      onChange={(e) => onChange(sanitizePersonCount(e.target.value))}
    />
  );
}

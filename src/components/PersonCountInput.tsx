import { sanitizePersonCount } from '../logic/formatting';

interface Props {
  value: string;
  onChange: (v: string) => void;
  unitNumber: number;
  invalid?: boolean;
  /** «بر اساس واحد»: نمایش ۱ کم‌رنگ و غیرقابل ویرایش (مقدار واقعی دست‌نخورده می‌ماند) */
  disabled?: boolean;
}

/** ورودی تعداد نفرات: فقط تایپ دستی، بدون Spinner (type=text + inputMode=numeric) */
export function PersonCountInput({ value, onChange, unitNumber, invalid, disabled }: Props) {
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
      value={disabled ? '1' : value}
      aria-label={`تعداد نفرات واحد ${unitNumber}`}
      onChange={(e) => onChange(sanitizePersonCount(e.target.value))}
    />
  );
}

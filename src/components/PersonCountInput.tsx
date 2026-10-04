import { sanitizePersonCount } from '../logic/formatting';
import { VACANT_LABEL } from '../logic/vacant';

interface Props {
  value: string;
  onChange: (v: string) => void;
  unitNumber: number;
  invalid?: boolean;
  /** «بر اساس واحد»: نمایش ۱ کم‌رنگ و غیرقابل ویرایش (مقدار واقعی دست‌نخورده می‌ماند) */
  disabled?: boolean;
  /** با disabled: به‌جای مقدار واقعی، ۱ (وزن) نشان بده؛ برای واحد خالی false است تا نفرات واقعی دیده شود */
  showWeight?: boolean;
  /** واحد خالی: به‌جای عدد، «خالی» نوشته می‌شود (مقدار واقعی دست‌نخورده می‌ماند) */
  vacant?: boolean;
}

/** ورودی تعداد نفرات: فقط تایپ دستی، بدون Spinner (type=text + inputMode=numeric) */
export function PersonCountInput({ value, onChange, unitNumber, invalid, disabled, showWeight = true, vacant = false }: Props) {
  return (
    <input
      className={'input input--count' + (invalid ? ' is-invalid' : '') + (disabled ? ' is-weight' : '')}
      disabled={disabled}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      dir={vacant ? 'rtl' : 'ltr'}
      maxLength={4}
      value={vacant ? VACANT_LABEL : disabled && showWeight ? '1' : value}
      aria-label={`تعداد نفرات واحد ${unitNumber}`}
      onChange={(e) => onChange(sanitizePersonCount(e.target.value))}
    />
  );
}

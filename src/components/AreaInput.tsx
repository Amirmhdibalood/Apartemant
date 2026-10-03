import { DEFAULT_AREA, parseArea, sanitizeAreaInput } from '../logic/area';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** بعد از پایان ویرایش، با مقدار نهایی (نقطهٔ آخر حذف؛ خالی/نامعتبر ← متراژ پیش‌فرض ۱) */
  onBlur?: (finalValue: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}

/** ورودی متراژ (مترمربع، اعشار مجاز تا ۳ رقم): type=text + inputMode=decimal؛ ارقام فارسی و «٫» هنگام تایپ نرمال می‌شوند */
export function AreaInput({ value, onChange, onBlur, ariaLabel, id, className = '', disabled, invalid, placeholder = '۱' }: Props) {
  return (
    <input
      id={id}
      className={'input input--count input--area ' + className + (invalid ? ' is-invalid' : '') + (disabled ? ' is-weight' : '')}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      maxLength={10}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(sanitizeAreaInput(e.target.value))}
      onBlur={() => {
        let v = value.endsWith('.') ? value.slice(0, -1) : value;
        if (parseArea(v) === null) v = String(DEFAULT_AREA);
        if (v !== value) onChange(v);
        onBlur?.(v);
      }}
    />
  );
}

import { OptionPicker, type PickerOption } from './OptionPicker';

interface Props {
  id: string;
  label?: string;
  value: number;
  options: PickerOption[];
  onChange: (v: number) => void;
}

/**
 * فیلد انتخاب (سال، ماه، نوع هزینه، وضعیت و ...): از ۱.۶.۲ همان ظاهر کشویی «سال‌های فعال» تنظیمات
 * (OptionPicker که کلاس‌های YearPicker را دوباره استفاده می‌کند).
 */
export function SelectField({ id, label, value, options, onChange }: Props) {
  return (
    <div className="field select-field">
      <OptionPicker id={id} label={label ?? ''} ariaLabel={label} value={value} options={options} onChange={onChange} />
    </div>
  );
}

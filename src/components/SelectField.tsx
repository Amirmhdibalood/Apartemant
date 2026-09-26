import { IconChevronDown } from './Icons';

interface Option { value: number; label: string }

interface Props {
  id: string;
  label?: string;
  value: number;
  options: Option[];
  onChange: (v: number) => void;
}

/** کشوی انتخاب (Native select با ظاهر تصویر مرجع) */
export function SelectField({ id, label, value, options, onChange }: Props) {
  return (
    <div className="field">
      {label && <label className="field__label" htmlFor={id}>{label}</label>}
      <div className="select-wrap">
        <select id={id} className="input select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <IconChevronDown size={18} className="select-chevron" />
      </div>
    </div>
  );
}

import { IconCheck } from './Icons';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Checkbox({ checked, onChange, label, disabled, className, ariaLabel }: Props) {
  return (
    <label className={'checkbox' + (checked ? ' is-checked' : '') + (disabled ? ' is-disabled' : '') + (className ? ' ' + className : '')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="checkbox__box">{checked && <IconCheck size={14} strokeWidth={3} />}</span>
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  );
}

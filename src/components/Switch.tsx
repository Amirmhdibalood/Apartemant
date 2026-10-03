export function Switch({ checked, onChange, id, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; id: string; label: string; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={'switch' + (checked ? ' is-on' : '') + (disabled ? ' is-disabled' : '')}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

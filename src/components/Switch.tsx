export function Switch({ checked, onChange, id, label }: { checked: boolean; onChange: (v: boolean) => void; id: string; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={'switch' + (checked ? ' is-on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

import type { ExpenseType } from '../models/types';
import { EXPENSE_TILE_ROWS, EXPENSE_TYPES } from '../models/constants';
import { ExpenseIcon } from './ExpenseIcon';
import { useAdapt } from '../context/ThemeContext';

/** انتخاب نوع هزینه به‌صورت کاشی (فقط یک گزینه) */
export function ExpenseTypePicker({ value, onChange }: { value: ExpenseType | null; onChange: (t: ExpenseType) => void }) {
  const A = useAdapt();
  return (
    <div className="tiles" role="radiogroup" aria-label="نوع هزینه">
      {EXPENSE_TILE_ROWS.map((row, i) => (
        <div key={i} className={'tiles__row tiles__row--' + row.length}>
          {row.map((t) => {
            const info = EXPENSE_TYPES[t];
            const selected = value === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                className={'tile' + (selected ? ' is-selected' : '')}
                style={{ background: A(info.bg), ['--tile-color' as string]: A(info.color) }}
                onClick={() => onChange(t)}
              >
                <ExpenseIcon type={t} size={36} />
                <span className="tile__label">{info.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

import type { ExpenseType } from '../models/types';
import { useEntryPrefs } from '../context/EntryPrefsContext';
import { tileRows } from '../logic/entryPrefs';
import { ExpenseIcon } from './ExpenseIcon';
import { useTheme } from '../context/ThemeContext';
import { typeColors } from '../logic/typeColor';
import { typeInfo } from '../logic/billTypes';

/** انتخاب نوع هزینه به‌صورت کاشی (فقط یک گزینه) */
export function ExpenseTypePicker({ value, onChange }: { value: ExpenseType | null; onChange: (t: ExpenseType) => void }) {
  const { theme, palette, lightPalette } = useTheme();
  const { prefs } = useEntryPrefs();
  // فقط انواع فعال (تنظیمات ← انواع قبض و روش‌های محاسبه)؛ نوعِ انتخاب‌شدهٔ فعلی (مثلاً در ویرایش) همیشه دیده می‌شود
  const rows = tileRows(value && !prefs.types.includes(value) ? { ...prefs, types: [...prefs.types, value] } : prefs);
  return (
    <div className="tiles" role="radiogroup" aria-label="نوع هزینه">
      {rows.map((row, i) => (
        <div key={i} className={'tiles__row tiles__row--' + row.length}>
          {row.map((t) => {
            const info = typeInfo(t);
            const selected = value === t;
            const colors = typeColors(t, theme, palette, lightPalette);
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                className={'tile' + (info.custom ? ' ct-tile' : '') + (selected ? ' is-selected' : '')}
                style={info.custom
                  ? { ['--tc' as string]: colors.color, ['--tile-color' as string]: colors.color }
                  : { background: colors.bg, ['--tile-color' as string]: colors.color }}
                onClick={() => onChange(t)}
              >
                {info.custom && <span className="ct-mark" aria-hidden="true">سفارشی</span>}
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

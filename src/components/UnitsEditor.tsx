import { IconMinus, IconPlus, IconUser } from './Icons';
import { PersonCountInput } from './PersonCountInput';

interface Props {
  personCounts: string[];
  onChange: (v: string[]) => void;
}

/** ۳. بخش واحدها: افزودن/حذف واحد، شماره خودکار، تعداد نفرات فقط با تایپ دستی */
export function UnitsEditor({ personCounts, onChange }: Props) {
  return (
    <section className="units">
      <div className="section-head">
        <h2 className="section-title">واحدها</h2>
        <div className="section-head__actions">
          <button
            type="button"
            className="square-btn square-btn--red"
            aria-label="حذف آخرین واحد"
            onClick={() => onChange(personCounts.slice(0, -1))}
            disabled={personCounts.length === 0}
          >
            <IconMinus size={18} strokeWidth={3} />
          </button>
          <button
            type="button"
            className="square-btn square-btn--green"
            aria-label="افزودن واحد"
            onClick={() => onChange([...personCounts, ''])}
          >
            <IconPlus size={18} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="table-card">
        <div className="units-row units-row--head">
          <span className="units-row__unit">واحد</span>
          <span className="units-row__count">
            <IconUser size={14} />
            تعداد نفرات
          </span>
        </div>
        {personCounts.length === 0 && <div className="units-empty">هنوز واحدی اضافه نشده است. با دکمه + واحد اضافه کنید.</div>}
        {personCounts.map((pc, i) => (
          <div className="units-row" key={i}>
            <span className="units-row__unit">
              <span className="unit-avatar"><IconUser size={16} /></span>
              واحد {i + 1}
            </span>
            <span className="units-row__count">
              <PersonCountInput
                unitNumber={i + 1}
                value={pc}
                onChange={(v) => onChange(personCounts.map((x, j) => (j === i ? v : x)))}
              />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

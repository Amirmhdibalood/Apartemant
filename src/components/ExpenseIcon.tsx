import type { ExpenseType } from '../models/types';
import { EXPENSE_TYPES } from '../models/constants';
import { IconBolt, IconBuilding, IconDots, IconDrop, IconFlame } from './Icons';

export function ExpenseGlyph({ type, size = 22 }: { type: ExpenseType; size?: number }) {
  const color = EXPENSE_TYPES[type].color;
  const props = { size, style: { color } };
  switch (type) {
    case 'water': return <IconDrop {...props} />;
    case 'electricity': return <IconBolt {...props} />;
    case 'gas': return <IconFlame {...props} />;
    case 'building': return <IconBuilding {...props} />;
    default: return <IconDots {...props} />;
  }
}

/** دایره رنگی با آیکون نوع هزینه */
export function ExpenseIcon({ type, size = 44, plain = false }: { type: ExpenseType; size?: number; plain?: boolean }) {
  const info = EXPENSE_TYPES[type];
  return (
    <span
      className="expense-icon"
      style={{ width: size, height: size, background: plain ? 'transparent' : info.iconBg }}
    >
      <ExpenseGlyph type={type} size={Math.round(size * (plain ? 0.82 : 0.52))} />
    </span>
  );
}

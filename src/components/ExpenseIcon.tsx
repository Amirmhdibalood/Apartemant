import type { ExpenseType } from '../models/types';
import { EXPENSE_TYPES } from '../models/constants';
import { useAdapt } from '../context/ThemeContext';
import { IconBolt, IconBroom, IconBuilding, IconDots, IconDrop, IconFlame, IconSparkles, IconWrench } from './Icons';

export function ExpenseGlyph({ type, size = 22 }: { type: ExpenseType; size?: number }) {
  const color = EXPENSE_TYPES[type].color;
  const A = useAdapt();
  const props = { size, style: { color: A(color) } };
  switch (type) {
    case 'water': return <IconDrop {...props} />;
    case 'electricity': return <IconBolt {...props} />;
    case 'gas': return <IconFlame {...props} />;
    case 'building': return <IconBuilding {...props} />;
    case 'cleaning': return <IconBroom {...props} />;
    case 'repairs': return <IconWrench {...props} />;
    case 'beautification': return <IconSparkles {...props} />;
    default: return <IconDots {...props} />;
  }
}

/** دایره رنگی با آیکون نوع هزینه */
export function ExpenseIcon({ type, size = 44, plain = false }: { type: ExpenseType; size?: number; plain?: boolean }) {
  const info = EXPENSE_TYPES[type];
  const A = useAdapt();
  return (
    <span
      className="expense-icon"
      style={{ width: size, height: size, background: plain ? 'transparent' : A(info.iconBg) }}
    >
      <ExpenseGlyph type={type} size={Math.round(size * (plain ? 0.82 : 0.52))} />
    </span>
  );
}

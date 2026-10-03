import type { ExpenseType } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { typeColors } from '../logic/typeColor';
import { IconBolt, IconBroom, IconBuilding, IconDots, IconDrop, IconFlame, IconSparkles, IconWrench } from './Icons';

/** آیکون نوع هزینه با رنگ صریح (بدون وابستگی به ThemeProvider؛ برای ساخت تصویر قبض در ریشه جدا) */
export function GlyphSvg({ type, size = 22, color }: { type: ExpenseType; size?: number; color: string }) {
  const props = { size, style: { color } };
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

export function ExpenseGlyph({ type, size = 22 }: { type: ExpenseType; size?: number }) {
  const { theme, palette } = useTheme();
  return <GlyphSvg type={type} size={size} color={typeColors(type, theme, palette).color} />;
}

/** دایره رنگی با آیکون نوع هزینه */
export function ExpenseIcon({ type, size = 44, plain = false }: { type: ExpenseType; size?: number; plain?: boolean }) {
  const { theme, palette } = useTheme();
  return (
    <span
      className="expense-icon"
      style={{ width: size, height: size, background: plain ? 'transparent' : typeColors(type, theme, palette).iconBg }}
    >
      <ExpenseGlyph type={type} size={Math.round(size * (plain ? 0.82 : 0.52))} />
    </span>
  );
}

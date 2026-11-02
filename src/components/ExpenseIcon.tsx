import type { CSSProperties } from 'react';
import type { ExpenseType } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { typeColors } from '../logic/typeColor';
import { getCustomType } from '../logic/billTypes';
import { CustomTypeGlyph } from './CustomTypeIcons';
import { IconBolt, IconBroom, IconBuilding, IconDots, IconDrop, IconFlame, IconSparkles, IconWrench } from './Icons';

/** آیکون نوع هزینه با رنگ صریح (بدون وابستگی به ThemeProvider؛ برای ساخت تصویر قبض در ریشه جدا) */
export function GlyphSvg({ type, size = 22, color }: { type: ExpenseType | string; size?: number; color: string }) {
  const props = { size, style: { color } };
  switch (type) {
    case 'water': return <IconDrop {...props} />;
    case 'electricity': return <IconBolt {...props} />;
    case 'gas': return <IconFlame {...props} />;
    case 'building': return <IconBuilding {...props} />;
    case 'cleaning': return <IconBroom {...props} />;
    case 'repairs': return <IconWrench {...props} />;
    case 'beautification': return <IconSparkles {...props} />;
    default: {
      const c = getCustomType(type);
      return c ? <CustomTypeGlyph icon={c.icon} size={size} color={color} /> : <IconDots {...props} />;
    }
  }
}

export function ExpenseGlyph({ type, size = 22 }: { type: ExpenseType; size?: number }) {
  const { theme, palette, lightPalette } = useTheme();
  return <GlyphSvg type={type} size={size} color={typeColors(type, theme, palette, lightPalette).color} />;
}

/** دایره رنگی با آیکون نوع هزینه (نوع سفارشی: زمینه با color-mix روی متغیرهای تم، مثل موکاپ ۱۰) */
export function ExpenseIcon({ type, size = 44, plain = false }: { type: ExpenseType; size?: number; plain?: boolean }) {
  const { theme, palette, lightPalette } = useTheme();
  const colors = typeColors(type, theme, palette, lightPalette);
  const custom = getCustomType(type);
  if (custom) {
    return (
      <span
        className={'expense-icon ct-icon' + (plain ? ' ct-icon--plain' : '')}
        style={{ width: size, height: size, ['--tc' as string]: colors.color } as CSSProperties}
      >
        <CustomTypeGlyph icon={custom.icon} size={Math.round(size * (plain ? 0.82 : 0.55))} />
      </span>
    );
  }
  return (
    <span
      className="expense-icon"
      style={{ width: size, height: size, background: plain ? 'transparent' : colors.iconBg }}
    >
      <ExpenseGlyph type={type} size={Math.round(size * (plain ? 0.82 : 0.52))} />
    </span>
  );
}

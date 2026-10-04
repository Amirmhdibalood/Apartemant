/**
 * ساخت نسخه شبانه تصویر صفحه ورود (intro-art*.svg) از روی نسخه روشن، با همان پالت تاریک برنامه.
 * آسمان به شب سرمه‌ای، خورشید به ماه (رنگ گرم، ملایم) و بقیه رنگ‌ها با darkHex تبدیل می‌شود.
 * اجرا: npm run theme:generate  (تست مطمئن می‌شود خروجی‌ها همگام‌اند.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { darkHex } from '../src/logic/darkColor.ts';
import { DARK_PALETTE_ORDER } from '../src/logic/darkPalettes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASES = ['intro-art.svg', 'intro-art-landscape.svg'];
/** نام فایل شبانه: سرمه‌ای همان نام قدیمی (intro-art-dark.svg)، بقیه با پسوند پالت (intro-art-dark-warm.svg) */
export const artName = (base, id) => base.replace('.svg', id === 'navy' ? '-dark.svg' : `-dark-${id}.svg`);
export const ART_FILES = DARK_PALETTE_ORDER.flatMap((id) => BASES.map((f) => ({
  id,
  src: path.join(ROOT, 'src/assets', f),
  out: path.join(ROOT, 'src/assets', artName(f, id)),
})));

/** آسمان شب: رنگ‌های ثابت به‌جای تبدیل خودکار (بالا تیره‌تر، نزدیک افق کمی روشن‌تر) */
const MOON = { '#FFF4CC': '#f2eed8', '#FFE08A': '#b9a96a' }; // ماه به‌جای خورشید
const NIGHT = {
  navy: { '#BFD6FF': '#0a1020', '#E4EEFF': '#111a33', '#F7FAFF': '#1a2747', '#AFCBFF': '#0a1020', '#DCE8FF': '#111a33', '#F3F7FF': '#18244a', '#EAF2FF': '#2a3a66' },
  charcoal: { '#BFD6FF': '#0b0c0d', '#E4EEFF': '#131415', '#F7FAFF': '#1b1d20', '#AFCBFF': '#0b0c0d', '#DCE8FF': '#131415', '#F3F7FF': '#1a1c1f', '#EAF2FF': '#2c2f33' },
  amoled: { '#BFD6FF': '#000000', '#E4EEFF': '#040405', '#F7FAFF': '#0c0d0e', '#AFCBFF': '#000000', '#DCE8FF': '#040405', '#F3F7FF': '#0a0b0c', '#EAF2FF': '#1a1b1d' },
  warm: { '#BFD6FF': '#0f0c0a', '#E4EEFF': '#16110e', '#F7FAFF': '#1f1813', '#AFCBFF': '#0f0c0a', '#DCE8FF': '#16110e', '#F3F7FF': '#1d1611', '#EAF2FF': '#352b23' },
};

export function generateDarkArt(svg, id = 'navy') {
  return svg.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (m) => {
    const key = '#' + (m.length === 4 ? m.slice(1).split('').map((c) => c + c).join('') : m.slice(1)).toUpperCase();
    return NIGHT[id][key] ?? MOON[key] ?? darkHex(m, id);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const { id, src, out } of ART_FILES) {
    fs.writeFileSync(out, generateDarkArt(fs.readFileSync(src, 'utf8'), id), 'utf8');
    console.log('[dark-art] wrote', path.relative(ROOT, out));
  }
}

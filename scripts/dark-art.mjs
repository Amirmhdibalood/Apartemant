/**
 * ساخت نسخه شبانه تصویر صفحه ورود (intro-art*.svg) از روی نسخه روشن، با همان پالت تاریک برنامه.
 * آسمان به شب سرمه‌ای، خورشید به ماه (رنگ گرم، ملایم) و بقیه رنگ‌ها با darkHex تبدیل می‌شود.
 * اجرا: npm run theme:generate  (تست مطمئن می‌شود خروجی‌ها همگام‌اند.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { darkHex } from '../src/logic/darkColor.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ART_FILES = ['intro-art.svg', 'intro-art-landscape.svg'].map((f) => ({
  src: path.join(ROOT, 'src/assets', f),
  out: path.join(ROOT, 'src/assets', f.replace('.svg', '-dark.svg')),
}));

/** آسمان شب: رنگ‌های ثابت به‌جای تبدیل خودکار (بالا تیره‌تر، نزدیک افق کمی روشن‌تر) */
const NIGHT = {
  '#BFD6FF': '#0a1020', '#E4EEFF': '#111a33', '#F7FAFF': '#1a2747',
  '#AFCBFF': '#0a1020', '#DCE8FF': '#111a33', '#F3F7FF': '#18244a',
  '#EAF2FF': '#2a3a66', // ابرها
  '#FFF4CC': '#f2eed8', '#FFE08A': '#b9a96a', // ماه به‌جای خورشید
};

export function generateDarkArt(svg) {
  return svg.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (m) => {
    const key = '#' + (m.length === 4 ? m.slice(1).split('').map((c) => c + c).join('') : m.slice(1)).toUpperCase();
    return NIGHT[key] ?? darkHex(m);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const { src, out } of ART_FILES) {
    fs.writeFileSync(out, generateDarkArt(fs.readFileSync(src, 'utf8')), 'utf8');
    console.log('[dark-art] wrote', path.relative(ROOT, out));
  }
}

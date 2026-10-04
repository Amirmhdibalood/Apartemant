/**
 * ساخت نسخهٔ هر پالت روشن (به‌جز «آسمانی» که فایل اصلی است) از تصویر صفحه ورود (intro-art*.svg)
 * با همان تبدیل رنگ lightHex که CSS و بقیهٔ برنامه استفاده می‌کنند.
 * اجرا: npm run theme:generate  (تست مطمئن می‌شود خروجی‌ها همگام‌اند.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lightHex } from '../src/logic/lightColor.ts';
import { LIGHT_PALETTE_ORDER, LIGHT_PALETTES } from '../src/logic/lightPalettes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASES = ['intro-art.svg', 'intro-art-landscape.svg'];
/** نام فایل: intro-art-light-paper.svg / intro-art-landscape-light-paper.svg */
export const lightArtName = (base, id) => base.replace('.svg', `-light-${id}.svg`);
export const LIGHT_ART_FILES = LIGHT_PALETTE_ORDER.filter((id) => !LIGHT_PALETTES[id].identity).flatMap((id) => BASES.map((f) => ({
  id,
  src: path.join(ROOT, 'src/assets', f),
  out: path.join(ROOT, 'src/assets', lightArtName(f, id)),
})));

export function generateLightArt(svg, id) {
  return svg.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (m) => lightHex(m, id));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const { id, src, out } of LIGHT_ART_FILES) {
    fs.writeFileSync(out, generateLightArt(fs.readFileSync(src, 'utf8'), id), 'utf8');
    console.log('[light-art] wrote', path.relative(ROOT, out));
  }
}

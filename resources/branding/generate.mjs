/**
 * Branding generator (option 1: soft sky + city skyline) — OPTIONAL dev tool.
 * Produces the source SVGs in resources/branding/src, the Android resources in
 * resources/android/res (icons + native splash) and src/assets/intro-art.svg.
 * The generated files are committed, so normal builds do NOT need this script.
 *
 * Requirements (only to regenerate): `npm i -D playwright` (or set PLAYWRIGHT_MODULE)
 * and a Chrome/Chromium (set CHROME_PATH).  Run:  node resources/branding/generate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'resources/branding/src');
const RES = path.join(ROOT, 'resources/android/res');
const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource/vazirmatn/files');
const TITLE = 'محاسبه شارژ ساختمان';
const SUB = 'آپارتمانت';

const F = (w) => fs.readFileSync(path.join(FONT_DIR, `vazirmatn-arabic-${w}-normal.woff2`)).toString('base64');
const fontStyle = () => `<style>
@font-face{font-family:'Vazirmatn';font-weight:800;src:url(data:font/woff2;base64,${F(800)}) format('woff2');}
@font-face{font-family:'Vazirmatn';font-weight:900;src:url(data:font/woff2;base64,${F(900)}) format('woff2');}
.fa{font-family:'Vazirmatn',sans-serif;direction:rtl;unicode-bidi:plaintext}
</style>`;
const svg = (w, h, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${extra}>${body}</svg>`;

/* ---------- shared drawing helpers ---------- */
function windows(x, y, cols, rows, ww, wh, gx, gy, fill, extra = '') {
  let s = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    s += `<rect x="${x + c * (ww + gx)}" y="${y + r * (wh + gy)}" width="${ww}" height="${wh}" rx="${Math.min(ww, wh) * 0.18}" fill="${fill}" ${extra}/>`;
  return s;
}
const tree = (x, y, s = 1, c1 = '#4FAE78', c2 = '#3D9A66') => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-5" y="-10" width="10" height="46" rx="4" fill="#6B7A6F"/>
    <circle cx="0" cy="-40" r="38" fill="${c1}"/>
    <circle cx="-16" cy="-24" r="24" fill="${c2}" opacity=".55"/>
    <circle cx="14" cy="-56" r="16" fill="#fff" opacity=".18"/>
  </g>`;
const cloud = (x, y, s = 1, o = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})" opacity="${o}" fill="#fff">
    <ellipse cx="0" cy="0" rx="90" ry="34"/><circle cx="-30" cy="-22" r="36"/><circle cx="26" cy="-30" r="46"/><circle cx="66" cy="-6" r="30"/>
  </g>`;
/** building with windows; mono=true draws a white body with black windows (for a mask) */
function building(x, y, w, h, gradId, cols, rows, opts = {}, mono = false) {
  const pad = w * 0.16, gx = w * 0.09, ww = (w - pad * 2 - (cols - 1) * gx) / cols;
  const wh = opts.wh ?? ww * 1.05, gy = opts.gy ?? wh * 0.62;
  const body = mono ? '#fff' : `url(#${gradId})`, win = mono ? '#000' : (opts.win ?? '#EAF2FF');
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.06}" fill="${body}"/>
    ${mono ? '' : `<rect x="${x}" y="${y}" width="${w * 0.5}" height="${h}" rx="${w * 0.06}" fill="#fff" opacity=".08"/>`}
    <rect x="${x - w * 0.04}" y="${y - w * 0.05}" width="${w * 1.08}" height="${w * 0.09}" rx="${w * 0.04}" fill="${mono ? '#fff' : (opts.roof ?? '#1D4FC4')}"/>
    ${windows(x + pad, y + w * 0.2, cols, rows, ww, wh, gx, gy, win, mono ? '' : 'opacity=".95"')}
    ${opts.door ? `<rect x="${x + w / 2 - w * 0.12}" y="${y + h - w * 0.32}" width="${w * 0.24}" height="${w * 0.32}" rx="${w * 0.05}" fill="${win}"/>` : ''}
  </g>`;
}
const DEFS = `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFD6FF"/><stop offset=".55" stop-color="#E4EEFF"/><stop offset="1" stop-color="#F7FAFF"/></linearGradient>
    <linearGradient id="skyS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AFCBFF"/><stop offset=".45" stop-color="#DCE8FF"/><stop offset=".8" stop-color="#F3F7FF"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4CC"/><stop offset=".55" stop-color="#FFE08A" stop-opacity=".9"/><stop offset="1" stop-color="#FFE08A" stop-opacity="0"/></radialGradient>
    <linearGradient id="bMain" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A8BFF"/><stop offset="1" stop-color="#2F6FEB"/></linearGradient>
    <linearGradient id="bSide" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FB4FA"/><stop offset="1" stop-color="#6B98F2"/></linearGradient>
    <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6CC794"/><stop offset="1" stop-color="#43A56E"/></linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6CC794"/><stop offset="1" stop-color="#3E9C68"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>`;

/* ---------- ICON (1024 = 108dp adaptive canvas; safe zone r≈313) ---------- */
const iconBuildings = (mono = false) => `
  <g transform="translate(512 800) scale(0.8) translate(-512 -800)">
    ${building(300, 470, 130, 330, 'bSide', 2, 5, { roof: '#5C8BEA', gy: 20 }, mono)}
    ${building(594, 430, 140, 370, 'bSide', 2, 6, { roof: '#5C8BEA', gy: 18 }, mono)}
    ${building(410, 280, 200, 520, 'bMain', 3, 7, { door: true, gy: 22 }, mono)}
  </g>`;
const iconBackgroundBody = () => `
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <circle cx="665" cy="420" r="125" fill="url(#sun)"/>
  ${cloud(345, 440, 0.7, 0.9)}${cloud(740, 580, 0.45, 0.75)}`;
const iconForegroundBody = () => `
  ${iconBuildings()}
  <path d="M0 800 Q 260 730 512 770 T 1024 780 V1024 H0Z" fill="url(#hill)"/>
  <path d="M0 850 Q 300 800 560 840 T 1024 830 V1024 H0Z" fill="#3E9C68" opacity=".55"/>
  ${tree(330, 800, 0.8)}${tree(700, 802, 0.9)}${tree(385, 818, 0.6, '#5BBE86')}`;
const iconBackground = () => svg(1024, 1024, `<defs>${DEFS}</defs>${iconBackgroundBody()}`);
const iconForeground = () => svg(1024, 1024, `<defs>${DEFS}</defs>${iconForegroundBody()}`);
const iconFull = () => svg(1024, 1024, `<defs>${DEFS}</defs>${iconBackgroundBody()}${iconForegroundBody()}`);
// Android 13 themed icon: only alpha matters -> building silhouettes with window holes + ground line
const iconMonochrome = () => svg(1024, 1024, `
  <defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#000"/>${iconBuildings(true)}
    <rect x="300" y="796" width="424" height="22" rx="11" fill="#fff"/>
  </mask></defs>
  <rect width="1024" height="1024" fill="#000" mask="url(#m)"/>`);

/* ---------- SPLASH / INTRO ART ---------- */
function portraitArt() {
  let far = '', near = '';
  const farB = [[40, 150, 740], [200, 120, 660], [330, 170, 800], [520, 130, 690], [660, 160, 830], [840, 140, 720], [990, 120, 770]];
  const BASE = 1790;
  for (const [x, w, h0] of farB) {
    const h = h0 - 130, y = BASE - h;
    far += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#C9DAFB"/>` + windows(x + 22, y + 34, 3, Math.floor((h - 60) / 56), (w - 44 - 28) / 3, 30, 14, 26, '#fff', 'opacity=".55"');
  }
  near += building(90, BASE - 480, 190, 480, 'bSide', 3, 7, { roof: '#5C8BEA', gy: 28 });
  near += building(300, BASE - 640, 240, 640, 'bMain', 3, 9, { door: true, gy: 30 });
  near += building(560, BASE - 560, 200, 560, 'bSide', 3, 8, { roof: '#5C8BEA', gy: 28 });
  near += building(780, BASE - 440, 210, 440, 'bMain', 3, 6, { door: true, gy: 30 });
  return `<defs>${DEFS}</defs>
  <rect width="1080" height="1920" fill="url(#skyS)"/>
  <circle cx="820" cy="360" r="260" fill="url(#sun)"/>
  ${cloud(230, 300, 1.2, .95)}${cloud(900, 620, .8, .8)}${cloud(160, 900, .7, .7)}${cloud(760, 1000, 1, .6)}
  ${far}
  <rect x="0" y="1100" width="1080" height="820" fill="url(#fade)"/>
  ${near}
  <path d="M0 1790 Q 280 1740 560 1775 T 1080 1770 V1920 H0Z" fill="url(#ground)"/>
  <path d="M0 1850 Q 320 1810 600 1845 T 1080 1835 V1920 H0Z" fill="#3E9C68" opacity=".6"/>
  ${tree(60, 1800, 1.3)}${tree(285, 1810, 1.0, '#5BBE86')}${tree(555, 1805, 1.2)}${tree(1015, 1795, 1.4)}${tree(770, 1812, 0.95, '#5BBE86')}${tree(180, 1870, 0.8, '#5BBE86')}${tree(900, 1875, 0.85, '#5BBE86')}`;
}
// title is kept inside the central ~65% width so CENTER_CROP on tall phones (≈9:19.5) never cuts it
const portraitText = (dy = 0) => `
  <text x="540" y="${730 + dy}" text-anchor="middle" class="fa" font-weight="900" font-size="68" fill="#16235A">${TITLE}</text>
  <rect x="490" y="${764 + dy}" width="100" height="8" rx="4.5" fill="#2F6FEB" opacity=".9"/>
  <text x="540" y="${842 + dy}" text-anchor="middle" class="fa" font-weight="800" font-size="50" fill="#2F6FEB">${SUB}</text>`;
// in-app intro art: no text (title/subtitle are real HTML text in the app), anchored to the bottom
const introArt = () => svg(1080, 1920, portraitArt(), 'preserveAspectRatio="xMidYMax slice"');
const splashPortrait = () => svg(1080, 1920, fontStyle() + portraitArt() + portraitText());

function landscapeArt() {
  let far = '', near = '';
  const BASE = 1010;
  const farB = [[20, 140, 380], [180, 110, 300], [420, 150, 340], [700, 120, 280], [1080, 130, 300], [1330, 150, 360], [1560, 120, 290], [1720, 160, 400]];
  for (const [x, w, h] of farB) {
    const y = BASE - h;
    far += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#C9DAFB"/>` + windows(x + 20, y + 30, 3, Math.floor((h - 50) / 50), (w - 40 - 24) / 3, 26, 12, 24, '#fff', 'opacity=".55"');
  }
  near += building(60, BASE - 400, 170, 400, 'bSide', 3, 6, { roof: '#5C8BEA', gy: 24 });
  near += building(250, BASE - 520, 200, 520, 'bMain', 3, 8, { door: true, gy: 24 });
  near += building(1480, BASE - 480, 190, 480, 'bMain', 3, 7, { door: true, gy: 26 });
  near += building(1690, BASE - 360, 170, 360, 'bSide', 3, 5, { roof: '#5C8BEA', gy: 24 });
  return `<defs>${DEFS}</defs>
  <rect width="1920" height="1080" fill="url(#skyS)"/>
  <circle cx="1560" cy="200" r="220" fill="url(#sun)"/>
  ${cloud(300, 170, 1.0, .95)}${cloud(1150, 150, .8, .8)}${cloud(700, 520, .6, .6)}
  ${far}
  <rect x="0" y="600" width="1920" height="480" fill="url(#fade)"/>
  ${near}
  <path d="M0 1010 Q 480 970 960 995 T 1920 990 V1080 H0Z" fill="url(#ground)"/>
  <path d="M0 1050 Q 520 1020 1000 1045 T 1920 1040 V1080 H0Z" fill="#3E9C68" opacity=".6"/>
  ${tree(40, 1015, 1.1)}${tree(480, 1020, 1.0, '#5BBE86')}${tree(1420, 1018, 1.1)}${tree(1880, 1012, 1.2)}${tree(700, 1030, 0.8, '#5BBE86')}${tree(1200, 1032, 0.85, '#5BBE86')}`;
}
const splashLandscape = () => svg(1920, 1080, fontStyle() + landscapeArt() + `
  <text x="960" y="430" text-anchor="middle" class="fa" font-weight="900" font-size="104" fill="#16235A">${TITLE}</text>
  <rect x="890" y="482" width="140" height="10" rx="5" fill="#2F6FEB" opacity=".9"/>
  <text x="960" y="590" text-anchor="middle" class="fa" font-weight="800" font-size="64" fill="#2F6FEB">${SUB}</text>`);

/* ---------- write SVGs ---------- */
fs.mkdirSync(SRC, { recursive: true });
const sources = {
  'icon-full.svg': iconFull(),
  'icon-background.svg': iconBackground(),
  'icon-foreground.svg': iconForeground(),
  'icon-monochrome.svg': iconMonochrome(),
  'splash-portrait.svg': splashPortrait(),
  'splash-landscape.svg': splashLandscape(),
};
for (const [n, c] of Object.entries(sources)) fs.writeFileSync(path.join(SRC, n), c);
fs.writeFileSync(path.join(ROOT, 'src/assets/intro-art.svg'), introArt());
fs.writeFileSync(path.join(ROOT, 'src/assets/intro-art-landscape.svg'), svg(1920, 1080, landscapeArt(), 'preserveAspectRatio="xMidYMax slice"'));

/* ---------- render PNGs ---------- */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const tmpHtml = path.join(ROOT, 'resources/branding/.render.html');

/** render an svg into w x h. mode: 'full' | 'crop' (central 72/108 like an adaptive mask) ; shape: 'square'|'rounded'|'circle' */
async function render(svgFile, out, w, h, { mode = 'full', shape = 'square', fit = 'cover', transparent = false, margin = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const src = 'file://' + path.join(SRC, svgFile);
  const inner = w - 2 * margin;
  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '22%' : '0';
  const img = mode === 'crop'
    ? `<img src="${src}" style="position:absolute;width:150%;height:150%;left:-25%;top:-25%">`
    : `<img src="${src}" style="width:100%;height:100%;object-fit:${fit};object-position:50% 100%">`;
  fs.writeFileSync(tmpHtml, `<html><body style="margin:0;background:transparent">
    <div style="position:absolute;left:${margin}px;top:${margin}px;width:${inner}px;height:${h - 2 * margin}px;overflow:hidden;border-radius:${radius}">${img}</div></body></html>`);
  await page.goto('file://' + tmpHtml);
  await page.evaluate(() => Promise.all([document.fonts.ready, ...Array.from(document.images).map((i) => i.decode())]));
  await page.waitForTimeout(150);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(D)) {
  const layer = Math.round(108 * k), legacy = Math.round(48 * k), m = Math.round(legacy * 0.02);
  await render('icon-foreground.svg', `${RES}/mipmap-${d}/ic_launcher_foreground.png`, layer, layer, { transparent: true });
  await render('icon-background.svg', `${RES}/mipmap-${d}/ic_launcher_background.png`, layer, layer);
  await render('icon-monochrome.svg', `${RES}/mipmap-${d}/ic_launcher_monochrome.png`, layer, layer, { transparent: true });
  await render('icon-full.svg', `${RES}/mipmap-${d}/ic_launcher.png`, legacy, legacy, { mode: 'crop', shape: 'rounded', transparent: true, margin: m });
  await render('icon-full.svg', `${RES}/mipmap-${d}/ic_launcher_round.png`, legacy, legacy, { mode: 'crop', shape: 'circle', transparent: true, margin: m });
}
const PORT = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(PORT)) {
  await render('splash-portrait.svg', `${RES}/drawable-port-${d}/splash.png`, w, h);
  await render('splash-landscape.svg', `${RES}/drawable-land-${d}/splash.png`, h, w);
}
await render('splash-landscape.svg', `${RES}/drawable/splash.png`, 480, 320);
// high-res exports for stores/docs
await render('icon-full.svg', path.join(ROOT, 'resources/branding/icon-1024.png'), 1024, 1024);
await render('icon-full.svg', path.join(ROOT, 'resources/branding/icon-512.png'), 512, 512);
fs.rmSync(tmpHtml, { force: true });
await browser.close();
console.log('branding generated');

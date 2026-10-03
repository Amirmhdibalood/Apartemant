// Mockup helper: remaps the LIGHT theme colours of the built CSS to alternative light palettes (mockup only)
const hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
export const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2; const d = mx - mn;
  if (d) { s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
export const hsl2rgb = ([h, s, l]) => { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)); };
export const toHex = (rgb) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lin = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
export const lum = ([r, g, b]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

export const LIGHTS = [
  { id: 'current', n: 0, name: 'آسمانی (فعلی)', desc: 'روشن فعلی برنامه؛ زمینهٔ آبی‌خاکستری بسیار روشن و تأکید آبی', identity: true },
  { id: 'paper', n: 1, name: 'کاغذ گرم', desc: 'زمینهٔ کرم/کاغذی گرم، کارت عاجی، متن قهوه‌ای تیره و تأکید آبی جوهری؛ چشم‌نواز برای استفادهٔ طولانی',
    bg: '#f6efe2', card: '#fffdf8', nh: 38, nsMul: .85, th: 28, ts: .28, tm: 1, md: 0, bd: 0, ah: 212, as: .72, aL: .40, mc: 4.6 },
  { id: 'mint', n: 2, name: 'نعناعی سرد', desc: 'زمینهٔ سفید با رگهٔ نعناعی، متن سبز-اسلیتی تیره و تأکید فیروزه‌ای عمیق؛ تازه و آرام',
    bg: '#edf7f4', card: '#fbfefd', nh: 162, nsMul: .75, th: 192, ts: .30, tm: 1, md: 0, bd: 0, ah: 188, as: .82, aL: .34, mc: 4.6 },
  { id: 'lavender', n: 3, name: 'اسلیت یاسی', desc: 'زمینهٔ یاسی خیلی روشن، متن اسلیت-نیلی تیره و تأکید نیلی؛ ملایم و مدرن',
    bg: '#f1effa', card: '#fdfcff', nh: 252, nsMul: .8, th: 248, ts: .32, tm: 1, md: 0, bd: 0, ah: 246, as: .62, aL: .58, mc: 4.6 },
  { id: 'graycool', n: 4, name: 'خاکستری سرد (کنتراست بالا)', desc: 'زمینهٔ خاکستری خنثی و کارت سفید خالص، متن تقریباً سیاه، حاشیه‌های پررنگ‌تر و آبی سیر؛ بیشترین خوانایی',
    bg: '#eceff3', card: '#ffffff', nh: 214, nsMul: .22, th: 214, ts: .18, tm: .62, md: 0, bd: .07, ah: 222, as: .82, aL: .40, mc: 7 },
];
for (const T of LIGHTS) { if (T.identity) continue; T.bgRgb = hex2rgb(T.bg); T.cardRgb = hex2rgb(T.card); T.bgHsl = rgb2hsl(T.bgRgb); T.cardHsl = rgb2hsl(T.cardRgb);
  // accent: lower L until white text has contrast >= 4.6 (or 7 for the high-contrast option)
  let aL = T.aL; while (contrast(hsl2rgb([T.ah, T.as, aL]), [255, 255, 255]) < (T.mc >= 7 ? 6.5 : 5.0) && aL > .15) aL -= .005; T.aL = aL;
  // muted shift: darken the mid-grey family until #7a8398 (muted) meets contrast against both bg and card
  const base = rgb2hsl(hex2rgb('#7a8398')); let md = 0; const mk = (d) => hsl2rgb([T.nh, Math.min(base[1], .25), base[2] - d]);
  while ((contrast(mk(md), T.bgRgb) < T.mc || contrast(mk(md), T.cardRgb) < T.mc) && md < .4) md += .005; T.md = md; }

export function mapColor(rgb, T) {
  if (T.identity) return rgb;
  const [h, s, l] = rgb2hsl(rgb); const blueish = h >= 195 && h <= 250 && s > .12;
  const grey = s < .2 || (blueish && s < .7);
  if (l >= .995) return T.cardRgb;
  if (l > .955 && l < .975 && blueish && s > .5 && s < .6) return T.bgRgb;
  if (l >= .80) {
    if (grey && (blueish || s < .2)) { let nl = l; if (l < .95) nl = l - T.bd; return hsl2rgb([T.nh, clamp(s * T.nsMul, 0, .6), clamp(nl + (T.id === 'paper' && l > .9 ? -.012 : 0), 0, 1)]); }
    if (blueish) return hsl2rgb([T.ah, s * .9, l]);
    return rgb;
  }
  if (h >= 135 && h <= 165 && s > .4 && l > .33 && l < .5) return hsl2rgb([h, s, l - .075]); // success green: white text >= 4.5
  if (blueish && s >= .45) return hsl2rgb([T.ah, T.as, clamp(T.aL + (l - .57) * .8, .18, .7)]);
  if (l < .45 && s < .45) return hsl2rgb([T.th, Math.min(s, T.ts), l * T.tm]);
  if (s < .45) return hsl2rgb([T.nh, Math.min(s, .25), clamp(l - T.md, 0, 1)]);
  return rgb;
}
export function transformCss(text, T) {
  if (T.identity) return text;
  text = text.replace(/((?:^|[;{\s])(?:color|fill|stroke)\s*:\s*)#fff(?:fff)?\b/g, '$1#ffffff~~');
  text = text.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g, (m, hx) => toHex(mapColor(hex2rgb(hx), T)));
  text = text.replace(/#ffffff~~/g, '#fff');
  text = text.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => {
    r = +r; g = +g; b = +b; if (r === 255 && g === 255 && b === 255) return m;
    const [h, s, l] = rgb2hsl([r, g, b]);
    let out;
    if (h >= 195 && h <= 250 && s > .5 && l > .4 && l < .7) out = hsl2rgb([T.ah, T.as, T.aL]);   // translucent brand blue
    else if (l < .3) out = hsl2rgb([T.nh, .3, .18]);                                               // shadows
    else out = mapColor([r, g, b], T);
    return a === undefined ? `rgb(${out.join(',')})` : `rgba(${out.join(',')},${a})`;
  });
  return text;
}
export const swatches = (T) => ['#f4f7fc', '#ffffff', '#1c2440', '#2f74f0', '#25a865', '#ef4444'].map(h => toHex(mapColor(hex2rgb(h), T)));
export const metrics = (T) => { const m = (h) => mapColor(hex2rgb(h), T); const bg = m('#f4f7fc'), card = m('#ffffff');
  return { text: contrast(m('#1c2440'), bg), text2: contrast(m('#3d4660'), card), muted: contrast(m('#7a8398'), bg), mutedCard: contrast(m('#7a8398'), card), whiteOnPrimary: contrast([255, 255, 255], m('#2f74f0')), primaryOnCard: contrast(m('#2f74f0'), card), primaryOnBg: contrast(m('#2f74f0'), bg), whiteOnSuccess: contrast([255,255,255], m('#1f9557')), successText: contrast(m('#1f6b44'), card) }; };

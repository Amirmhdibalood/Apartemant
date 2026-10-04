import { chromium } from 'playwright';
import fs from 'node:fs';
import { seedData } from './common.mjs';
import { LIGHTS, transformCss, swatches, metrics, mapColor, toHex } from './lightpal.mjs';
const h2r = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const OUT = '/workspace/building-charge/screenshots/light-theme-options/';
fs.mkdirSync(OUT, { recursive: true });
const seed = seedData();
const SW = LIGHTS.map(swatches);
const SUN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>`;
const MOON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z"/></svg>`;
const CHEV = `<svg class="tp-chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const mini = (s) => `<span class="tp-mini" style="background:${s[0]}"><span class="tp-mini__card" style="background:${s[1]}"><span class="tp-mini__bar" style="background:${s[2]}"></span><span class="tp-mini__dots"><i style="background:${s[3]}"></i><i style="background:${s[4]}"></i><i style="background:${s[5]}"></i></span></span></span>`;
const NAVY = ['#0d121f', '#151e33', '#d2d8e4', '#4784f2', '#7ae2ad', '#f15b5b'];
function block(sel) {
  const pals = LIGHTS.map((p, i) => `<button type="button" role="radio" aria-checked="${i === sel}" class="tp-pal${i === sel ? ' is-active' : ''}">${mini(SW[i])}<span class="tp-pal__txt"><span class="tp-pal__name">${p.name}${i === 0 ? '<span class="tp-def">پیش‌فرض</span>' : ''}</span><span class="tp-pal__desc">${p.desc}</span></span><span class="tp-check">${CHECK}</span></button>`).join('');
  return `<div class="settings-group tp-group" role="group" aria-labelledby="theme-title"><h3 class="settings-sub" id="theme-title">تم</h3>
  <p class="card__hint">حالت ظاهری برنامه را انتخاب کنید. با انتخاب هر پالت، همان لحظه اعمال و روی همین گوشی ذخیره می‌شود.</p>
  <div class="tp-modes">
   <div class="tp-mode"><button type="button" class="tp-mode__head" aria-expanded="false"><span class="tp-radio"></span><span class="tp-ico">${MOON}</span><span class="tp-txt"><span class="tp-title">تاریک</span><span class="tp-sub">پالت: سرمه‌ای عمیق</span></span><span class="tp-strip">${[NAVY[0], NAVY[1], NAVY[3]].map(c => `<i style="background:${c}"></i>`).join('')}</span>${CHEV}</button></div>
   <div class="tp-mode is-current is-open"><button type="button" class="tp-mode__head" aria-expanded="true"><span class="tp-radio"></span><span class="tp-ico">${SUN}</span><span class="tp-txt"><span class="tp-title">روشن<span class="tp-cur">فعال</span></span><span class="tp-sub">پالت: ${LIGHTS[sel].name}</span></span>${CHEV}</button>
    <div class="tp-body" role="radiogroup" aria-label="پالت‌های روشن">${pals}</div></div>
  </div></div>`;
}
const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const res = [];
for (const T of LIGHTS) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fa-IR' });
  const s = { ...seed, 'CapacitorStorage.bc.theme': JSON.stringify('light') };
  await ctx.addInitScript((s) => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('__seeded', '1'); } }, s);
  await ctx.route(/\.(css|svg)(\?.*)?$/, async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: transformCss(await r.text(), T) }); });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  const tag = `option${T.n}-${T.id}`;
  const S = async (name) => { await p.waitForTimeout(350); const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); res.push([tag, name, o.sw === o.cw]); await p.screenshot({ path: OUT + `${tag}-${name}.png` }); };
  await p.goto('http://localhost:4293/'); await p.waitForSelector('.intro'); await p.click('.intro'); await p.waitForSelector('.home__title');
  if (!T.identity) { // inline hero illustration has hard-coded fills in the JS bundle: remap them in the DOM
    const used = await p.evaluate(() => { const set = new Set(); document.querySelectorAll('svg').forEach(sv => { if (sv.getBoundingClientRect().width < 100) return; sv.querySelectorAll('*').forEach(e => ['fill', 'stroke', 'stop-color'].forEach(a => { const v = e.getAttribute(a); if (v && /^#[0-9a-f]{3,6}$/i.test(v)) set.add(v); })); }); return [...set]; });
    const map = Object.fromEntries(used.map(h => [h.toLowerCase(), toHex(mapColor(h2r(h), T))]));
    await p.evaluate((map) => { document.querySelectorAll('svg').forEach(sv => { if (sv.getBoundingClientRect().width < 100) return; sv.querySelectorAll('*').forEach(e => ['fill', 'stroke', 'stop-color'].forEach(a => { const v = e.getAttribute(a); if (v && map[v.toLowerCase()]) e.setAttribute(a, map[v.toLowerCase()]); })); }); }, map);
  }
  await S('01-home');
  await p.click('.bottom-nav button:has-text("تنظیمات")'); await p.waitForSelector('[data-acc="appearance"]');
  await p.click('[data-acc="appearance"] .acc__head'); await p.waitForTimeout(450);
  await p.evaluate((html) => { const g = document.querySelector('.tp-group'); const w = document.createElement('div'); w.innerHTML = html; g.replaceWith(w.firstElementChild); }, block(T.n));
  await p.evaluate(() => { const c = document.querySelector('.tp-group'); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 76); });
  await S('02-settings-theme-light-expanded');
  await p.click('.bottom-nav button:has-text("خانه")'); await p.waitForTimeout(300);
  await p.click('text=ثبت قبض جدید'); await p.waitForSelector('.tiles'); await p.waitForTimeout(300);
  await p.click('.tile:has-text("گاز")'); await p.click('#amount'); await p.keyboard.type('3000000');
  await p.evaluate(() => window.scrollTo(0, 0)); await S('03-bill-form');
  await p.click('.sticky-action .btn'); await p.waitForSelector('.screen--result'); await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0)); await S('04-result');
  await p.evaluate(() => { const e = document.querySelector('.table-card'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); }); await S('05-result-table');
  await ctx.close();
}
await br.close();
console.log(res.filter(r => !r[2]).length, 'overflow fails of', res.length);

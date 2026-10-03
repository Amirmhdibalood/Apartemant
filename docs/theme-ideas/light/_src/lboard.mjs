import { chromium } from 'playwright';
import fs from 'node:fs';
import { LIGHTS, swatches, metrics } from './lightpal.mjs';
const D = '/workspace/building-charge/screenshots/light-theme-options/';
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(D + f).toString('base64');
const fa = (n) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const labels = ['زمینه', 'کارت', 'متن', 'تأکید', 'موفق', 'خطا'];
const cols = LIGHTS.map((T) => {
  const sw = swatches(T), m = metrics(T), tag = `option${T.n}-${T.id}`;
  const ok = (v, t) => `<span class="${v >= t ? 'ok' : 'warn'}">${fa(v.toFixed(1))}</span>`;
  return `<section class="col"><div class="badge">${T.n === 0 ? 'گزینهٔ ۰ — مرجع (فعلی)' : 'گزینهٔ ' + fa(T.n)}</div><h2>${T.name}</h2><p class="desc">${T.desc}</p>
  <div class="sw">${sw.map((c, i) => `<div><i style="background:${c}"></i><b>${labels[i]}</b><u dir="ltr">${c}</u></div>`).join('')}</div>
  <table class="ct"><tr><td>متن روی زمینه</td><td>${ok(m.text, 7)}</td></tr><tr><td>متن کم‌رنگ روی زمینه</td><td>${ok(m.muted, 4.5)}</td></tr><tr><td>متن سفید روی دکمهٔ اصلی</td><td>${ok(m.whiteOnPrimary, 4.5)}</td></tr><tr><td>متن سفید روی دکمهٔ سبز</td><td>${ok(m.whiteOnSuccess, 4.5)}</td></tr></table>
  <div class="th"><figure><img src="${img(tag + '-01-home.png')}"><figcaption>خانه</figcaption></figure><figure><img src="${img(tag + '-02-settings-theme-light-expanded.png')}"><figcaption>تنظیمات ← تم ← روشن</figcaption></figure>
  <figure><img src="${img(tag + '-03-bill-form.png')}"><figcaption>فرم قبض</figcaption></figure><figure><img src="${img(tag + '-04-result.png')}"><figcaption>نتیجه</figcaption></figure></div></section>`;
}).join('');
const html = `<style>
body{margin:0;background:#dfe3ea;direction:rtl;font-family:'Vazirmatn',Tahoma,sans-serif;color:#18202e}
.wrap{padding:30px 30px 26px;width:2480px;box-sizing:border-box}
h1{margin:0 0 4px;font-size:34px;font-weight:900}.sub{margin:0 0 22px;color:#4a5568;font-size:17px}
.row{display:flex;gap:18px;align-items:stretch}
.col{flex:1;background:#fff;border-radius:20px;padding:18px 16px;box-shadow:0 4px 18px rgba(20,30,50,.12);min-width:0}
.badge{display:inline-block;font-size:13px;font-weight:800;padding:2px 12px;border-radius:99px;background:#e8edf5;color:#33415a;margin-bottom:8px}
h2{margin:0 0 6px;font-size:23px;font-weight:900}.desc{margin:0 0 12px;font-size:14px;line-height:1.85;color:#3a4558;min-height:78px}
.sw{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:12px}.sw div{text-align:center;font-size:11px;line-height:1.4}
.sw i{display:block;height:34px;border-radius:9px;border:1px solid rgba(0,0,0,.18);margin-bottom:3px}.sw b{display:block;font-weight:700}.sw u{text-decoration:none;color:#667;font-size:10px;font-family:monospace}
.ct{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:12px}.ct td{padding:3px 6px;border-bottom:1px solid #e6e9ef}.ct td:last-child{text-align:left;font-weight:800}.ok{color:#1b7a43}.warn{color:#b7791f}
.th{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0;text-align:center}figure img{width:100%;border-radius:14px;border:1px solid rgba(0,0,0,.14);display:block}figcaption{font-size:12px;color:#556;margin-top:4px}
.foot{margin-top:14px;font-size:13px;color:#4a5568;line-height:1.9}
</style><div class="wrap"><h1>گزینه‌های تم روشن «آپارتمانت» — مقایسهٔ پالت‌ها</h1><p class="sub">پیش‌نمایش (Mockup) — پیاده‌سازی نشده. گزینهٔ ۰ همان تم روشن فعلی است؛ ۴ گزینهٔ دیگر پیشنهادی‌اند. اعداد زیر هر پالت: نسبت کنتراست (سبز = قابل قبول، زرد = زیر حد توصیهٔ WCAG AA).</p><div class="row">${cols}</div>
<div class="foot">رنگ‌های معنایی (قرمز = خطا/حذف، زرد = هشدار، رنگ هر نوع هزینه) در همهٔ گزینه‌ها ثابت می‌ماند؛ فقط زمینه، کارت، متن، خاکستری‌ها، رنگ تأکید و (در گزینه‌های جدید) سبز موفق برای کنتراست بهتر تغییر می‌کند.</div></div>`;
const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await (await br.newContext({ viewport: { width: 2480, height: 1400 }, deviceScaleFactor: 1 })).newPage();
await p.goto('http://localhost:4293/'); await p.waitForTimeout(500);
await p.evaluate((h) => { document.documentElement.setAttribute('data-theme', 'light'); document.body.innerHTML = h; document.documentElement.style.background = '#dfe3ea'; }, html);
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
await p.screenshot({ path: D + '00-comparison-board.png', fullPage: true });
await br.close();

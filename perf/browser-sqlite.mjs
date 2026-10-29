/**
 * Headless Chrome harness for Apartemant 1.8.x (SQLite file seed).
 * 1) STRESS_DB_OUT=1 STRESS_BILLS=1000 npm run test:stress   → perf/data/stress-1000x100.db
 * 2) npm run build && npx vite preview --port 4180 --strictPort
 * 3) NODE_PATH=/tmp/pw/node_modules node perf/browser-sqlite.mjs --db perf/data/stress-1000x100.db --cpu 4
 * Measures nav→home ready, Records / Reports screens, long tasks (>50 ms) per step, JS heap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const get = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DB = get('--db', 'perf/data/stress-1000x100.db');
const CPU = Number(get('--cpu', '4'));
const URL = get('--url', 'http://localhost:4180/');

const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'] });
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await ctx.addInitScript(() => {
  window.__lt = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* ignore */ }
});
if (!process.env.SEED_STATIC) await ctx.route('**/__seed.db', (r) => r.fulfill({ body: fs.readFileSync(DB), contentType: 'application/octet-stream' }));

// seed on a static asset of the same origin so the app never runs during seeding
await p.goto(URL + 'favicon.svg');
await p.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('CapacitorStorage.bc.tutorialSeen', 'true');
  const buf = new Uint8Array(await (await fetch('/__seed.db')).arrayBuffer());
  const db = await new Promise((res, rej) => {
    const q = indexedDB.open('apartemant-sqlite-file', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('files');
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(buf, 'apartemant.db'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  // mark legacy IDB migration as done so the SQLite file is used directly
});
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

const out = { db: path.basename(DB), dbMB: +(fs.statSync(DB).size / 1048576).toFixed(1), cpu: CPU, steps: [] };
const lt = async () => p.evaluate(() => { const a = window.__lt.splice(0); return { n: a.length, max: a.length ? Math.max(...a) : 0, sum: a.reduce((s, x) => s + x, 0) }; });
const heap = async () => p.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null);
async function step(label, fn) {
  await lt();
  const t = Date.now();
  let ok = true; let err;
  try { await fn(); } catch (e) { ok = false; err = String(e.message || e).slice(0, 160); }
  const ms = Date.now() - t;
  await p.waitForTimeout(300);
  const s = { label, ok, ms, longTasks: await lt(), heapMB: await heap(), ...(err ? { err } : {}) };
  out.steps.push(s);
  console.log(JSON.stringify(s));
}

await step('startup → home ready', async () => {
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  // intro screen (~1.8 s) closes by itself; poll until the bottom nav is shown
  await p.waitForFunction(() => !!document.querySelector('.bottom-nav') && !document.querySelector('.spinner'), null, { timeout: 300000, polling: 200 });
});
await step('records open (cards rendered)', async () => {
  await p.click('.bottom-nav button:has-text("سوابق")');
  await p.waitForSelector('.record-card, .empty-state', { timeout: 300000 });
  out.recordCards = await p.locator('.record-card').count();
});
await step('records scroll ×10', async () => {
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 800); await p.waitForTimeout(50); }
});
await step('reports hub', async () => {
  await p.click('.bottom-nav button:has-text("گزارش‌ها")');
  await p.waitForSelector('.hub-row', { timeout: 300000 });
});
for (const id of ['yearly', 'monthly', 'monthlyDetail', 'charts', 'debtors', 'billPayments']) {
  await step(`report ${id}`, async () => {
    await p.click('.bottom-nav button:has-text("گزارش‌ها")');
    await p.waitForSelector('.hub-row', { timeout: 300000 });
    const row = p.locator(`.hub-row[data-report="${id}"]`);
    if (!(await row.count())) throw new Error('no hub row ' + id);
    await row.click();
    await p.waitForFunction(() => {
      const m = document.querySelector('main.screen');
      return m && !m.querySelector('.spinner') && m.innerText.length > 40;
    }, null, { timeout: 300000 });
  });
}
await step('home again', async () => {
  await p.click('.bottom-nav button:has-text("خانه")').catch(async () => p.locator('.bottom-nav button').first().click());
  await p.waitForTimeout(200);
});
out.errors = errors.slice(0, 10);
fs.mkdirSync('perf/results', { recursive: true });
fs.writeFileSync(`perf/results/browser-${path.basename(DB, '.db')}-cpu${CPU}.json`, JSON.stringify(out, null, 2));
console.log('errors:', out.errors.length, out.errors.slice(0, 3));
await br.close();

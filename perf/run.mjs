/**
 * Headless Chromium perf harness for Apartemant 1.7.9 (IDB seed).
 * Seeds IndexedDB + small Preferences keys with generated datasets,
 * throttles CPU (CDP), and times screens / operations.
 *
 * Prerequisites: `npm run build` and `python3 -m http.server 4180 -d dist` from app/
 * Usage:
 *   node perf/run.mjs                         # all fit-sized profiles, CPU 4x
 *   node perf/run.mjs --profile fit-500x12 --cpu 6
 *   node perf/run.mjs --probe-quota            # try progressively larger until QuotaExceeded
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dir, 'data');
const OUT = path.join(__dir, 'results');
const URL = process.env.PERF_URL || 'http://localhost:4180/';
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};
const has = (flag) => args.includes(flag);
const CPU = Number(get('--cpu', '4'));
const PROFILE = get('--profile', null);
const WIDTH = Number(get('--width', '390'));

function storeFromFile(name) {
  const p = path.join(DATA, `${name}.store.json`);
  if (!fs.existsSync(p)) throw new Error('missing ' + p);
  return { store: JSON.parse(fs.readFileSync(p, 'utf8')), meta: JSON.parse(fs.readFileSync(path.join(DATA, `${name}.meta.json`), 'utf8')) };
}

async function launch() {
  const br = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await br.newContext({
    viewport: { width: WIDTH, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    acceptDownloads: true,
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return { br, ctx, p, cdp };
}

async function seedIdb(page, store) {
  // Seed on about:blank so the app never holds IDB connections during delete/open.
  await page.goto(URL.replace(/\/?$/, '/') + 'perf-blank.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
  });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const del = indexedDB.deleteDatabase('apartemant');
      del.onsuccess = () => resolve();
      del.onerror = () => resolve();
      del.onblocked = () => resolve();
      setTimeout(resolve, 2000);
    });
  });
  // Open schema once
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('apartemant', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('bills')) db.createObjectStore('bills', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('units')) {
          const us = db.createObjectStore('units', { keyPath: 'id' });
          us.createIndex('byBillId', 'billId', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
  });
  // Chunked puts to avoid CDP payload / long single-tx issues
  const CHUNK = 2000;
  for (let i = 0; i < store.bills.length; i += CHUNK) {
    const chunk = store.bills.slice(i, i + CHUNK);
    await page.evaluate(async (rows) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('apartemant', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['bills'], 'readwrite');
        const bs = tx.objectStore('bills');
        for (const b of rows) bs.put(b);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, chunk);
  }
  for (let i = 0; i < store.units.length; i += CHUNK) {
    const chunk = store.units.slice(i, i + CHUNK);
    await page.evaluate(async (rows) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('apartemant', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['units'], 'readwrite');
        const us = tx.objectStore('units');
        for (const u of rows) us.put(u);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, chunk);
  }
  await page.evaluate(async (meta) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('apartemant', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['meta'], 'readwrite');
      const ms = tx.objectStore('meta');
      ms.put({ key: 'schemaVersion', value: 2 });
      ms.put({ key: 'migration', value: { status: 'done', at: new Date().toISOString(), bills: meta.bills, units: meta.units } });
      ms.put({ key: 'prefsCleared', value: true });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem('CapacitorStorage.bc.building', JSON.stringify(meta.building));
    localStorage.setItem('CapacitorStorage.bc.schemaVersion', JSON.stringify('2'));
    localStorage.setItem('CapacitorStorage.bc.tutorialSeen', JSON.stringify(true));
    localStorage.setItem('CapacitorStorage.bc.settings', JSON.stringify(meta.settings));
  }, { bills: store.bills.length, units: store.units.length, building: store.building, settings: store.settings });
  return { bills: store.bills.length, units: store.units.length };
}

async function seedAndOpen(p, ctx, store) {
  const tSeed0 = performance.now();
  const seeded = await seedIdb(p, store);
  const tSeed = performance.now() - tSeed0;
  const t0 = performance.now();
  const nav = await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const tNav = performance.now() - t0;
  // skip intro if shown
  if (await p.locator('.intro').count()) {
    await p.click('.intro');
    await p.waitForTimeout(200);
  }
  if (await p.locator('text=متوجه شدم').count()) {
    await p.click('text=متوجه شدم');
    await p.waitForTimeout(200);
  }
  // wait for home chrome
  await p.waitForSelector('.home-topbar, .bottom-nav, .home__title', { timeout: 180000 });
  const tReady = performance.now() - t0;
  return { tNav, tReady, tSeed: +tSeed.toFixed(1), seeded, status: nav?.status() };
}

async function measureStorage(p) {
  return p.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('CapacitorStorage.bc.'));
    let utf16 = 0;
    const per = {};
    for (const k of keys) {
      const v = localStorage.getItem(k) || '';
      const n = (k.length + v.length) * 2;
      utf16 += n;
      per[k.replace('CapacitorStorage.bc.', '')] = { chars: v.length, utf16Bytes: n };
    }
    const idb = await new Promise((resolve) => {
      const req = indexedDB.open('apartemant');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('bills')) { resolve({ bills: 0, units: 0 }); return; }
        const tx = db.transaction(['bills', 'units'], 'readonly');
        const b = tx.objectStore('bills').count();
        const u = tx.objectStore('units').count();
        const out = {};
        b.onsuccess = () => { out.bills = b.result; };
        u.onsuccess = () => { out.units = u.result; };
        tx.oncomplete = () => resolve(out);
      };
      req.onerror = () => resolve({ bills: -1, units: -1 });
    });
    return { keyCount: keys.length, utf16Bytes: utf16, perKey: per, idb };
  });
}

async function mem(p) {
  try {
    const m = await p.evaluate(() => {
      const x = performance.memory;
      if (!x) return null;
      return { usedJSHeapMB: +(x.usedJSHeapSize / 1048576).toFixed(2), totalJSHeapMB: +(x.totalJSHeapSize / 1048576).toFixed(2), jsHeapLimitMB: +(x.jsHeapSizeLimit / 1048576).toFixed(2) };
    });
    return m;
  } catch {
    return null;
  }
}

async function time(label, fn) {
  const t0 = performance.now();
  let extra = {};
  try {
    extra = (await fn()) || {};
  } catch (e) {
    return { label, ok: false, ms: +(performance.now() - t0).toFixed(1), error: String(e.message || e).slice(0, 240) };
  }
  return { label, ok: true, ms: +(performance.now() - t0).toFixed(1), ...extra };
}

async function scrollList(p, sel, steps = 8) {
  const box = await p.locator(sel).first().boundingBox().catch(() => null);
  // scroll the main screen
  for (let i = 0; i < steps; i++) {
    await p.evaluate(() => window.scrollBy(0, 500));
    await p.waitForTimeout(40);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  return { scrolled: steps, box };
}

async function openReport(p, id) {
  await p.click(`.bottom-nav button:has-text("گزارش‌ها")`);
  await p.waitForSelector('.hub-row', { timeout: 60000 });
  await p.click(`.hub-row[data-report="${id}"]`);
  await p.waitForTimeout(100);
  // wait until loading finishes: either empty or content
  await p.waitForFunction(() => {
    const main = document.querySelector('main.screen');
    if (!main) return false;
    return !main.querySelector('.spinner') && (main.querySelector('.report-total, .empty-state, .chart, .bp-summary, .debtor, .yearly, canvas, svg') || main.innerText.length > 40);
  }, { timeout: 180000 }).catch(() => {});
}

async function back(p) {
  const b = p.locator('header button[aria-label*="بازگشت"]');
  if (await b.count()) {
    await b.first().click();
    await p.waitForTimeout(150);
  }
}

async function runProfile(name) {
  const { store, meta } = storeFromFile(name);
  const { br, ctx, p } = await launch();
  const result = { profile: name, meta, cpuThrottle: CPU, width: WIDTH, at: new Date().toISOString(), measures: [], storage: null, memory: {}, quotaProbe: null };
  const push = (m) => {
    result.measures.push(m);
    const flag = m.ok ? '' : ' FAIL';
    console.log(`  ${m.label}: ${m.ms}ms${flag}${m.error ? ' — ' + m.error : ''}`);
  };

  try {
    // Probe: can we even write this into localStorage in a blank page?
    // 1.7.9+: seed IndexedDB directly (Preferences quota no longer blocks large datasets)
    result.quotaProbe = { ok: true, note: 'idb-direct' };
    push(await time('startup+home-ready', async () => seedAndOpen(p, ctx, store)));
    result.storage = await measureStorage(p);
    result.memory.afterHome = await mem(p);

    push(
      await time('storage-read-parse (idb+join)', async () => {
        const r = await p.evaluate(async () => {
          const t0 = performance.now();
          const loadStore = (name) => new Promise((resolve, reject) => {
            const req = indexedDB.open('apartemant', 1);
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction([name], 'readonly');
              const g = tx.objectStore(name).getAll();
              g.onsuccess = () => { const rows = g.result; db.close(); resolve(rows); };
              g.onerror = () => reject(g.error);
            };
            req.onerror = () => reject(req.error);
          });
          const bills = await loadStore('bills');
          const units = await loadStore('units');
          const tParse = performance.now() - t0;
          const t1 = performance.now();
          const byBill = new Map();
          for (const u of units) {
            let a = byBill.get(u.billId);
            if (!a) { a = []; byBill.set(u.billId, a); }
            a.push(u);
          }
          const joined = bills.filter((b) => !b.deletedAt).map((b) => ({ bill: b, units: byBill.get(b.id) || [] }));
          const tJoinIndexed = performance.now() - t1;
          // skip naive join for huge sets (O(B×U) too expensive)
          let tJoinNaive = null;
          if (bills.length <= 1000 && units.length <= 25000) {
            const t2 = performance.now();
            bills.filter((b) => !b.deletedAt).map((b) => ({ bill: b, units: units.filter((u) => u.billId === b.id) }));
            tJoinNaive = +(performance.now() - t2).toFixed(1);
          }
          return {
            bills: bills.length,
            units: units.length,
            active: joined.length,
            parseMs: +tParse.toFixed(1),
            joinIndexedMs: +tJoinIndexed.toFixed(1),
            joinNaiveMs: tJoinNaive,
          };
        });
        return r;
      }),
    );

    push(
      await time('records-open+render', async () => {
        await p.click('.bottom-nav button:has-text("سوابق")');
        await p.waitForSelector('.record-card, .empty-state', { timeout: 180000 });
        const n = await p.locator('.record-card').count();
        return { cards: n };
      }),
    );
    result.memory.afterRecords = await mem(p);

    push(
      await time('records-scroll', async () => {
        await scrollList(p, 'main.screen--records', 12);
        return {};
      }),
    );

    push(
      await time('records-filter-month', async () => {
        // open month select if present
        const sel = p.locator('#rec-month, [id*="rec-month"]');
        if (await sel.count()) {
          await sel.first().click();
          await p.waitForTimeout(100);
          const opt = p.locator('.year-picker__list [role=radio], [role=option], button').filter({ hasText: 'مهر' }).first();
          if (await opt.count()) await opt.click();
          else await p.keyboard.press('Escape');
        }
        await p.waitForTimeout(200);
        const n = await p.locator('.record-card').count();
        return { cards: n };
      }),
    );

    // Reports hub
    push(
      await time('reports-hub', async () => {
        await p.click('.bottom-nav button:has-text("گزارش‌ها")');
        await p.waitForSelector('.hub-row', { timeout: 60000 });
        return { rows: await p.locator('.hub-row').count() };
      }),
    );

    const reports = [
      ['monthly', 'report-monthly'],
      ['monthlyDetail', 'report-monthly-detail'],
      ['charts', 'report-charts'],
      ['yearly', 'report-yearly'],
      ['debtors', 'report-debtors'],
      ['unitHistory', 'report-unit-history'],
      ['billPayments', 'report-bill-payments'],
    ];
    // discover actual data-report ids from DOM
    const ids = await p.evaluate(() => [...document.querySelectorAll('.hub-row[data-report]')].map((e) => e.getAttribute('data-report')));
    console.log('  hub reports:', ids.join(', '));
    for (const id of ids) {
      push(
        await time(`report:${id}`, async () => {
          await openReport(p, id);
          const title = await p.textContent('.app-header__title');
          await back(p);
          await p.waitForSelector('.hub-row', { timeout: 60000 });
          return { title };
        }),
      );
      result.memory[`after_${id}`] = await mem(p);
    }

    // Debtors pay preview (open debtors → pay first)
    if (ids.includes('debtors')) {
      push(
        await time('debtors-pay-preview', async () => {
          await openReport(p, 'debtors');
          const btn = p.locator('.debtor__pay').first();
          if (!(await btn.count())) {
            await back(p);
            return { skipped: true };
          }
          await btn.click();
          await p.waitForSelector('.up-alloc, .up-line', { timeout: 180000 });
          const lines = await p.locator('.up-line').count();
          await back(p);
          await back(p);
          return { allocLines: lines };
        }),
      );
    }

    // Backup export timing (in-page serialize of current store)
    push(
      await time('backup-serialize', async () => {
        return p.evaluate(async () => {
          const loadStore = (name) => new Promise((resolve, reject) => {
            const req = indexedDB.open('apartemant', 1);
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction([name], 'readonly');
              const g = tx.objectStore(name).getAll();
              g.onsuccess = () => { const rows = g.result; db.close(); resolve(rows); };
              g.onerror = () => reject(g.error);
            };
            req.onerror = () => reject(req.error);
          });
          const t0 = performance.now();
          const bills = await loadStore('bills');
          const units = await loadStore('units');
          const building = JSON.parse(localStorage.getItem('CapacitorStorage.bc.building') || 'null');
          const settings = JSON.parse(localStorage.getItem('CapacitorStorage.bc.settings') || '{}');
          const backup = { app: 'apartemant', backupVersion: 7, appVersion: '1.7.9', createdAt: new Date().toISOString(), data: { bills, units, settings, building } };
          const text = JSON.stringify(backup); // compact
          return { msBuild: +(performance.now() - t0).toFixed(1), bytes: text.length, mb: +(text.length / 1048576).toFixed(2) };
        });
      }),
    );

    // Backup import parse (read the generated backup file content into page and parse)
    const backupText = fs.readFileSync(path.join(DATA, `${name}.backup.json`), 'utf8');
    push(
      await time('backup-parse+validate', async () => {
        return p.evaluate((text) => {
          const t0 = performance.now();
          const obj = JSON.parse(text);
          const tParse = performance.now() - t0;
          const t1 = performance.now();
          const ok = obj && obj.app === 'apartemant' && Array.isArray(obj.data?.bills) && Array.isArray(obj.data?.units);
          const years = [...new Set(obj.data.bills.map((b) => b.year))];
          return { parseMs: +tParse.toFixed(1), summaryMs: +(performance.now() - t1).toFixed(1), ok, bills: obj.data.bills.length, units: obj.data.units.length, years };
        }, backupText);
      }),
    );

    // Save a new bill (navigate to form, fill minimal, save) — may be slow with large building
    push(
      await time('new-bill-open+prefill', async () => {
        // return to home (may be nested after debtors pay)
        for (let i = 0; i < 5; i++) {
          if (await p.locator('.bottom-nav button:has-text("خانه")').count()) break;
          const b = p.locator('header button[aria-label*="بازگشت"]');
          if (await b.count()) { await b.first().click(); await p.waitForTimeout(200); } else break;
        }
        await p.click('.bottom-nav button:has-text("خانه")');
        await p.waitForSelector('.home-topbar, .home__title, button:has-text("ثبت قبض جدید")', { timeout: 60000 });
        await p.locator('button:has-text("ثبت قبض جدید")').first().click();
        await p.waitForSelector('main.screen, #amount, .units-editor, .unit-row', { timeout: 120000 });
        const rows = await p.locator('.unit-row, .units-editor__row, [data-unit]').count();
        return { unitRows: rows };
      }),
    );

    push(
      await time('new-bill-type-amount', async () => {
        // pick type if needed
        const typeBtn = p.locator('button:has-text("آب"), .expense-type button').first();
        if (await typeBtn.count()) await typeBtn.click().catch(() => {});
        const amount = p.locator('#amount, input[inputmode="numeric"], input[name="amount"]').first();
        if (await amount.count()) {
          await amount.click();
          await p.keyboard.type('1250000', { delay: 5 });
        }
        return {};
      }),
    );

    result.memory.afterNewBill = await mem(p);
    result.storageFinal = await measureStorage(p);
  } finally {
    await br.close();
  }
  return result;
}

async function probeQuotaLadder() {
  // Try writing increasing JSON blobs to find Chrome's localStorage ceiling
  const { br, ctx, p } = await launch();
  const sizes = [];
  try {
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (const mb of [1, 2, 3, 4, 4.5, 5, 5.5, 6, 8, 10]) {
      const r = await p.evaluate((mb) => {
        try {
          localStorage.clear();
          const chunk = 'x'.repeat(256 * 1024); // 256KiB BMP → 512KiB utf16 each
          const charsNeeded = Math.floor(mb * 1024 * 1024); // interpret mb as UTF-16 megabytes target / 2 = char count for ascii
          // requestAsciiMB means "MB of ASCII chars" → utf16 bytes = 2x
          const targetChars = Math.floor(mb * 1024 * 1024);
          let s = '';
          while (s.length + chunk.length <= targetChars) s += chunk;
          if (s.length < targetChars) s += 'x'.repeat(targetChars - s.length);
          localStorage.setItem('probe', s);
          const stored = localStorage.getItem('probe')?.length || 0;
          localStorage.removeItem('probe');
          return { ok: true, requestedChars: s.length, storedChars: stored, utf16MB: (stored * 2) / 1048576 };
        } catch (e) {
          return { ok: false, error: String(e.name || e.message || e), utf16MB: mb * 2 };
        }
      }, mb);
      sizes.push({ requestAsciiMB: mb, ...r });
      console.log(`  quota probe ascii ${mb}MB →`, r.ok ? `ok utf16=${r.utf16MB}MB` : r.error);
      if (!r.ok) break;
    }
  } finally {
    await br.close();
  }
  return sizes;
}

const DEFAULT_PROFILES = ['small-200x12', 'mid-800x24', 'large-5000x12', 'stress-10000x20'];

async function main() {
  console.log(`CPU throttle ×${CPU}, width=${WIDTH}, url=${URL}`);
  const all = { cpu: CPU, url: URL, started: new Date().toISOString(), profiles: [], quotaLadder: null };

  if (has('--probe-quota')) {
    console.log('Quota ladder:');
    all.quotaLadder = await probeQuotaLadder();
  }

  const list = PROFILE ? [PROFILE] : DEFAULT_PROFILES;
  for (const name of list) {
    if (!fs.existsSync(path.join(DATA, `${name}.store.json`))) {
      console.log('skip missing', name);
      continue;
    }
    console.log(`\n=== ${name} ===`);
    const r = await runProfile(name);
    all.profiles.push(r);
    fs.writeFileSync(path.join(OUT, `${name}-cpu${CPU}.json`), JSON.stringify(r, null, 2));
  }

  all.finished = new Date().toISOString();
  const outFile = path.join(OUT, `summary-cpu${CPU}.json`);
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));

  // Markdown summary
  let md = `# Perf results (CPU ×${CPU})\n\n`;
  md += `URL: ${URL}\n\n`;
  if (all.quotaLadder) {
    md += `## localStorage quota probe\n\n`;
    for (const q of all.quotaLadder) md += `- ascii ${q.requestAsciiMB}MB → ${q.ok ? 'OK' : q.error}\n`;
    md += '\n';
  }
  for (const r of all.profiles) {
    md += `## ${r.profile}\n\n`;
    md += `- bills=${r.meta.billCount}, unitRows=${r.meta.unitRows}, units/bill=${r.meta.unitCount}\n`;
    md += `- estimated utf16=${(r.meta.storageUtf16BytesEst / 1048576).toFixed(2)}MB (${r.meta.localStorageRisk})\n`;
    if (r.quotaProbe) md += `- seed: ${r.quotaProbe.ok ? 'OK' : 'FAIL ' + r.quotaProbe.error}\n`;
    if (r.storage) md += `- measured localStorage utf16=${(r.storage.utf16Bytes / 1048576).toFixed(2)}MB\n`;
    md += `\n| measure | ms | notes |\n|---|---:|---|\n`;
    for (const m of r.measures) {
      const notes = m.error || (m.cards != null ? `cards=${m.cards}` : m.title || m.allocLines != null ? `lines=${m.allocLines}` : m.parseMs != null ? `parse=${m.parseMs}` : '');
      md += `| ${m.label} | ${m.ms} | ${m.ok ? notes : 'FAIL ' + (m.error || '')} |\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(OUT, `summary-cpu${CPU}.md`), md);
  console.log('\nWrote', outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

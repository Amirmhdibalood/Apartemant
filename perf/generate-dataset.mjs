/**
 * Generate realistic Apartemant datasets for perf testing.
 * Writes JSON files under perf/data/ and prints byte-size vs ~5MB localStorage risk.
 *
 * Usage: node perf/generate-dataset.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, 'data');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = ['water', 'electricity', 'gas', 'building', 'cleaning', 'repairs', 'beautification', 'misc'];
const METHODS = ['perPerson', 'perUnit', 'perArea'];
const FIRST = ['آقای', 'خانم'];
const LAST = ['رضایی', 'احمدی', 'کریمی', 'موسوی', 'حسینی', 'صادقی', 'نوری', 'جعفری', 'کاظمی', 'مرادی', 'باقری', 'حیدری', 'اکبری', 'یوسفی', 'شریفی', 'محمدی', 'علیزاده', 'حیدرزاده', 'اسدی', 'نظری', 'فرهادی', 'پناهی', 'سلیمانی', 'طاهری', 'رستمی'];

const LS_SOFT = 4.5 * 1024 * 1024; // leave headroom under typical ~5MB
const LS_HARD = 5 * 1024 * 1024;

function split(total, w) {
  const s = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (total * x) / s);
  const fl = raw.map(Math.floor);
  let r = total - fl.reduce((a, b) => a + b, 0);
  const idx = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of idx) {
    if (r <= 0) break;
    fl[i]++;
    r--;
  }
  return fl;
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

function iso(y, m, d, h = 8) {
  // approximate jalali month → gregorian for timestamps (good enough for perf data)
  const gY = y - 621;
  const gM = ((m + 2) % 12) + 1;
  const gY2 = gM <= 3 ? gY : gY + (m >= 10 ? 1 : 0);
  return new Date(Date.UTC(gY2, gM - 1, Math.min(28, d), h, (d * 7) % 60)).toISOString();
}

function jDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * @param {{ name: string, billCount: number, unitCount: number, years?: number[], seed?: number }} opts
 */
export function generate(opts) {
  const { name, billCount, unitCount, years = [1402, 1403, 1404, 1405], seed = 1 } = opts;
  let rng = seed;
  const rnd = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0x100000000;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  const persons = Array.from({ length: unitCount }, (_, i) => 1 + ((i * 3 + seed) % 5));
  const areas = Array.from({ length: unitCount }, (_, i) => 45 + ((i * 17 + seed * 3) % 90) + (i % 3 === 0 ? 0.5 : 0));
  const aliases = Array.from({ length: unitCount }, (_, i) => `${pick(FIRST)} ${LAST[i % LAST.length]}`);
  // ~8% vacant
  const vacant = Array.from({ length: unitCount }, (_, i) => i > 0 && i % 13 === 0);

  const building = {
    units: aliases.map((alias, i) => ({
      alias,
      defaultPersons: vacant[i] ? persons[i] : persons[i],
      area: areas[i],
      ...(vacant[i] ? { vacant: true } : {}),
    })),
  };

  const bills = [];
  const units = [];
  let bi = 0;
  const monthsPerYear = 12;
  // distribute billCount across years × months × types (repeat cycles)
  const slots = [];
  for (const y of years) {
    for (let m = 1; m <= monthsPerYear; m++) {
      for (const t of TYPES) slots.push([y, m, t]);
    }
  }
  while (slots.length < billCount) slots.push(...slots.slice(0, billCount - slots.length));

  for (let i = 0; i < billCount; i++) {
    const [year, month, expenseType] = slots[i % slots.length];
    const id = `p${seed}b${pad(i + 1, 5)}`;
    const method = expenseType === 'gas' || expenseType === 'building' ? (expenseType === 'gas' ? 'perUnit' : pick(METHODS)) : pick(['perPerson', 'perArea', 'perPerson']);
    const base = 400_000 + Math.floor(rnd() * 5_500_000) + month * 12_000 + bi * 17;
    const total = Math.round(base / 1000) * 1000;
    const day = 5 + Math.floor(rnd() * 20);
    const createdAt = iso(year, month, Math.min(28, day));
    const hasDue = rnd() > 0.15;
    const dueDay = Math.min(28, day + 7 + Math.floor(rnd() * 10));
    const dueDate = hasDue ? jDate(year, month, dueDay) : null;
    // ~12% soft-deleted
    const deleted = rnd() < 0.12;
    // ~55% billPaid among non-deleted older months
    const billPaid = !deleted && (year < 1405 || month < 6) && rnd() < 0.55;
    const billPaidDate = billPaid ? jDate(year, month, Math.min(28, dueDay - 1)) : null;
    const deletedAt = deleted ? iso(year, month, Math.min(28, dueDay + 3), 12) : null;

    bills.push({
      id,
      year,
      month,
      expenseType,
      billNumber: rnd() < 0.2 ? String(10000 + i) : null,
      description: rnd() < 0.1 ? 'توضیح نمونه' : null,
      totalAmount: total,
      createdAt,
      isFullySettled: false,
      splitMethod: method,
      billPaid,
      billPaidDate,
      dueDate,
      deletedAt,
    });

    const w = vacant.map((v, ui) => {
      if (v) return 0;
      if (method === 'perPerson') return persons[ui];
      if (method === 'perArea') return areas[ui];
      return 1;
    });
    // if all vacant somehow, force first unit
    if (w.every((x) => x === 0)) w[0] = 1;
    const shares = split(total, w);
    let settledAll = true;
    shares.forEach((share, ui) => {
      const uid = `${id}-u${ui + 1}`;
      if (vacant[ui] || share === 0) {
        units.push({
          id: uid,
          billId: id,
          unitNumber: ui + 1,
          personCount: vacant[ui] ? 0 : persons[ui],
          alias: aliases[ui],
          area: areas[ui],
          vacant: true,
          shareAmount: 0,
          isSettled: true,
          payments: [],
        });
        return;
      }
      // payment plan: fully paid / partial / unpaid
      const r = rnd();
      let payFrac = 0;
      if (deleted) payFrac = r < 0.3 ? 1 : r < 0.5 ? 0.4 : 0;
      else if (billPaid && year < 1405) payFrac = r < 0.7 ? 1 : r < 0.85 ? 0.5 : 0;
      else if (year === 1405 && month >= 6) payFrac = r < 0.25 ? 1 : r < 0.45 ? 0.35 : 0;
      else payFrac = r < 0.5 ? 1 : r < 0.7 ? 0.4 : 0;

      const payments = [];
      if (payFrac > 0) {
        const amt = Math.min(share, Math.round((share * payFrac) / 1000) * 1000 || Math.min(share, 1000));
        payments.push({
          id: `pay${i}_${ui}`,
          amount: amt,
          paidAt: iso(year, month, Math.min(28, dueDay + 2), 10),
        });
        if (payFrac > 0.5 && payFrac < 1 && rnd() < 0.3) {
          const rest = Math.min(share - amt, Math.round((share * 0.2) / 1000) * 1000);
          if (rest > 0) {
            payments.push({
              id: `pay${i}_${ui}b`,
              amount: rest,
              paidAt: iso(year, month, Math.min(28, dueDay + 5), 11),
            });
          }
        }
      }
      const paid = payments.reduce((a, p) => a + p.amount, 0);
      const isSettled = paid >= share;
      if (!isSettled) settledAll = false;
      units.push({
        id: uid,
        billId: id,
        unitNumber: ui + 1,
        personCount: persons[ui],
        alias: aliases[ui],
        area: areas[ui],
        shareAmount: share,
        isSettled,
        payments,
      });
    });
    bills[bills.length - 1].isFullySettled = settledAll && !deleted;
    bi++;
  }

  const settings = {
    showSaveWarning: false,
    activeYears: years.slice(-3),
    dismissedWarnings: ['roundingAdjust', 'duplicateBill'],
  };

  const store = {
    bills,
    units,
    building,
    schemaVersion: '2',
    tutorialSeen: true,
    settings,
  };

  // Capacitor Preferences in browser → localStorage keys
  const payloads = {
    'CapacitorStorage.bc.bills': JSON.stringify(bills),
    'CapacitorStorage.bc.units': JSON.stringify(units),
    'CapacitorStorage.bc.building': JSON.stringify(building),
    'CapacitorStorage.bc.schemaVersion': JSON.stringify('2'),
    'CapacitorStorage.bc.tutorialSeen': JSON.stringify(true),
    'CapacitorStorage.bc.settings': JSON.stringify(settings),
  };
  const bytes = Object.values(payloads).reduce((a, s) => a + s.length * 2, 0); // UTF-16 for localStorage estimate
  const utf8 = Object.values(payloads).reduce((a, s) => a + Buffer.byteLength(s, 'utf8'), 0);

  const backup = {
    app: 'apartemant',
    backupVersion: 7,
    appVersion: '1.7.8',
    createdAt: new Date().toISOString(),
    data: { bills, units, settings, building },
  };

  const meta = {
    name,
    billCount: bills.length,
    unitRows: units.length,
    unitCount,
    years,
    deletedBills: bills.filter((b) => b.deletedAt).length,
    billPaid: bills.filter((b) => b.billPaid).length,
    withDue: bills.filter((b) => b.dueDate).length,
    partialPayments: units.filter((u) => (u.payments?.length ?? 0) > 0 && !u.isSettled).length,
    storageUtf8Bytes: utf8,
    storageUtf16BytesEst: bytes,
    localStorageRisk: utf8 > LS_HARD ? 'OVER_5MB_CHARS' : utf8 > LS_SOFT ? 'NEAR_LIMIT' : 'OK',
    softLimitBytes: LS_SOFT,
    hardLimitBytes: LS_HARD,
  };

  fs.writeFileSync(path.join(OUT, `${name}.meta.json`), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(OUT, `${name}.store.json`), JSON.stringify(store));
  fs.writeFileSync(path.join(OUT, `${name}.backup.json`), JSON.stringify(backup));
  // also write a slim seed object for Playwright addInitScript (same as store)
  console.log(
    `${name}: bills=${meta.billCount} unitRows=${meta.unitRows} units/bill=${unitCount} ` +
      `utf8=${(utf8 / 1024 / 1024).toFixed(2)}MB utf16≈${(bytes / 1024 / 1024).toFixed(2)}MB → ${meta.localStorageRisk}`,
  );
  return meta;
}

const profiles = [
  { name: 'small-200x12', billCount: 200, unitCount: 12, years: [1404, 1405] },
  { name: 'mid-800x24', billCount: 800, unitCount: 24, years: [1403, 1404, 1405] },
  { name: 'large-2000x20', billCount: 2000, unitCount: 20, years: [1402, 1403, 1404, 1405] },
  { name: 'large-5000x12', billCount: 5000, unitCount: 12, years: [1401, 1402, 1403, 1404, 1405] },
  { name: 'stress-5000x30', billCount: 5000, unitCount: 30, years: [1401, 1402, 1403, 1404, 1405] },
  { name: 'stress-10000x20', billCount: 10000, unitCount: 20, years: [1400, 1401, 1402, 1403, 1404, 1405] },
];

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-dataset.mjs')) {
  for (const p of profiles) generate({ ...p, seed: p.billCount + p.unitCount });
}

// Extra profiles sized to probe the localStorage cliff
if (process.argv.includes('--extra')) {
  for (const p of [
    { name: 'fit-400x16', billCount: 400, unitCount: 16, years: [1403, 1404, 1405] },
    { name: 'fit-500x12', billCount: 500, unitCount: 12, years: [1403, 1404, 1405] },
    { name: 'fit-600x10', billCount: 600, unitCount: 10, years: [1403, 1404, 1405] },
    { name: 'cliff-350x24', billCount: 350, unitCount: 24, years: [1403, 1404, 1405] },
    { name: 'cliff-450x20', billCount: 450, unitCount: 20, years: [1403, 1404, 1405] },
  ]) generate({ ...p, seed: p.billCount * 3 + p.unitCount });
}

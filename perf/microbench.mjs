/**
 * Node-side microbench for datasets too large for localStorage.
 * Mimics Preferences JSON.parse + billRepository withUnits (naive filter) vs Map index.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const names = process.argv.slice(2);
const list = names.length
  ? names
  : ["small-200x12", "fit-500x12", "mid-800x24", "large-2000x20", "large-5000x12", "stress-5000x30", "stress-10000x20"];

function bench(label, fn, repeats = 3) {
  let best = Infinity;
  let last;
  for (let i = 0; i < repeats; i++) {
    const t0 = performance.now();
    last = fn();
    best = Math.min(best, performance.now() - t0);
  }
  return { label, bestMs: +best.toFixed(1), ...last };
}

for (const name of list) {
  const p = path.join(DATA, `${name}.store.json`);
  if (!fs.existsSync(p)) { console.log("skip", name); continue; }
  const raw = fs.readFileSync(p);
  console.log(`\n=== ${name} file=${(raw.length / 1048576).toFixed(2)}MB ===`);
  const parse = bench("JSON.parse", () => {
    const store = JSON.parse(raw.toString("utf8"));
    return { bills: store.bills.length, units: store.units.length };
  });
  console.log(parse);
  const store = JSON.parse(raw.toString("utf8"));
  const { bills, units } = store;
  const ops = bills.length * units.length;
  if (ops <= 80_000_000) {
    console.log(bench("join-naive O(BxU filter)", () => {
      const joined = bills.filter((b) => !b.deletedAt).map((b) => ({ bill: b, units: units.filter((u) => u.billId === b.id) }));
      return { active: joined.length };
    }, 1));
  } else {
    console.log({ label: "join-naive O(BxU filter)", skipped: true, estimatedOps: ops });
  }
  console.log(bench("join-Map-index", () => {
    const byBill = new Map();
    for (const u of units) {
      let a = byBill.get(u.billId);
      if (!a) { a = []; byBill.set(u.billId, a); }
      a.push(u);
    }
    const joined = bills.filter((b) => !b.deletedAt).map((b) => ({ bill: b, units: byBill.get(b.id) || [] }));
    return { active: joined.length };
  }));
  console.log(bench("debtors-like scan (indexed)", () => {
    const bag = new Map();
    const byBill = new Map();
    for (const u of units) {
      let a = byBill.get(u.billId);
      if (!a) { a = []; byBill.set(u.billId, a); }
      a.push(u);
    }
    for (const b of bills) {
      if (b.deletedAt) continue;
      for (const u of byBill.get(b.id) || []) {
        const paid = (u.payments || []).reduce((s, pay) => s + pay.amount, 0);
        const rem = Math.max(0, u.shareAmount - paid);
        if (rem > 0) bag.set(u.unitNumber, (bag.get(u.unitNumber) || 0) + rem);
      }
    }
    return { debtors: [...bag.values()].filter((x) => x > 0).length };
  }));
  console.log(bench("JSON.stringify backup pretty", () => {
    const text = JSON.stringify({ app: "apartemant", backupVersion: 7, data: { bills, units } }, null, 2);
    return { outMB: +(Buffer.byteLength(text) / 1048576).toFixed(2) };
  }, 1));
}

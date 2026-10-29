# Perf harness (Apartemant 1.7.8)

Measures startup, storage parse/join, Records, reports, debtors-pay preview, backup serialize/parse, and new-bill open under Chromium CPU throttle (default 4×) to approximate a mid/low Android phone.

## Generate datasets

```bash
node perf/generate-dataset.mjs
node perf/generate-dataset.mjs --extra   # more sizes around the ~5MB localStorage cliff
```

Outputs under `perf/data/`: `*.store.json` (seed), `*.backup.json`, `*.meta.json` (sizes + risk).

**Important:** Capacitor Preferences falls back to `localStorage` in the browser. Typical quota ≈ **5 MB (UTF-16)**. Profiles marked `OVER_5MB` in meta usually cannot be seeded in WebView/Chrome; Android SharedPreferences may allow more, but huge single-key JSON is still risky.

## Run

```bash
npm run build
python3 -m http.server 4180 -d dist   # from app/
NODE_PATH=/tmp/pw/node_modules node perf/run.mjs --probe-quota
NODE_PATH=/tmp/pw/node_modules node perf/run.mjs --cpu 4
NODE_PATH=/tmp/pw/node_modules node perf/run.mjs --profile fit-500x12 --cpu 6
```

Results: `perf/results/*.json` and `summary-cpuN.md`.

Does not modify app code. Large `perf/data/` JSON should stay out of git (see `.gitignore` note in results).

## 1.8.x stress (SQLite / sql.js)

```bash
npm run test:stress                                   # 5000 & 10000 bills × 100 units (slow, not in `npm test`)
STRESS_BILLS=1000 STRESS_UNITS=100 STRESS_DB_OUT=1 npm run test:stress   # also dumps perf/data/stress-1000x100.db
npm run build && npx vite preview --port 4180 --strictPort
NODE_PATH=/tmp/pw/node_modules node perf/browser-sqlite.mjs --db perf/data/stress-1000x100.db --cpu 4
# DBs > ~50 MB: cp the .db to dist/__seed.db and run with SEED_STATIC=1
```

Results: `perf/results/stress-<bills>x<units>.json`, `perf/results/browser-*.json`.

## 1.8.x — full check (one command)

```bash
npm run test:full                 # unit tests + stress + scenario (1000 bills × 100 units) + build, short summary
npm run test:full -- --full       # same at 1000, 5000, 10000 bills (≈10 min, needs ~3 GB RAM)
npm run test:full -- --sizes=2000,4000
npm run test:scenario             # scenario suite only (SCENARIO_SIZES=1000,5000,10000 for big timings)
npm run test:stress               # all *.stress.ts (stress default 5000,10000 via STRESS_BILLS; scenario 1000)
```

`scripts/full-check.mjs` is plain Node (works on Windows too) and exits 1 if anything fails.

What the scenario suite (`tests/stress/scenario.stress.ts`) covers:
- 4 buildings with 5 / 20 / 100 / 20 units (one archived), each with bills, partial/full payments, fund deposits
  and withdrawals, management periods and meetings with attendance → full backup → wipe → restore → every table,
  every column (except regenerated child ids), prefs and the active building deep-equal; plus cold restarts.
- Old backup formats: fixtures v1 / v4 / v8 (`tests/fixtures/`) and a generated large v8 file.
- Corrupted / malicious backups: truncations, 300 byte-flips, prototype keys, wrong types, oversized values,
  missing sections — never throw, are rejected, and change no data. A restore that fails half-way rolls back.
- Large-scale timings (bills × 100 units + 2 small buildings): save, mark paid, pay, delete, cold start with journal
  replay, snapshot, collect/serialize/parse, safety copy, restore + digest compare. → `perf/results/scenario-*.json`.

Fast unit tests that guard the same things: `tests/fullBackup.test.ts` (backup v9 coverage: a new SQLite table or kv
key that is not classified fails the test), `tests/persistence.test.ts` (journal, crash/fault injection),
`tests/persistNative.test.ts` (simulated Android filesystem: chunked snapshot, tmp+rename, old 1.8.0 file).

### Persistence (from 1.8.x)
`apartemant.db` (snapshot) + `apartemant.db.journal` (row images changed since the snapshot, tracked with
sqlite3_update_hook). A save appends ~15 KB instead of exporting + base64-writing the whole DB. Snapshots are
written as `apartemant.db.tmp` in 3 MB base64 chunks, size-verified, then renamed; generation numbers make stale
journal lines harmless. Measured (Node, in-memory backend): save one 100-unit bill 61 ms → 7 ms at 1k bills,
≈380 ms → 10 ms at 5k, ≈1000 ms → 14 ms at 10k.

### بررسی کامل (فارسی)
برای اجرای همهٔ تست‌ها با یک دستور:

```bash
npm run test:full            # تست‌های واحد + تست فشار + سناریوها (۱۰۰۰ قبض × ۱۰۰ واحد) + بیلد
npm run test:full -- --full  # همین با ۱۰۰۰، ۵۰۰۰ و ۱۰۰۰۰ قبض (کندتر)
```

سناریوها: چند ساختمان با ۵، ۲۰ و ۱۰۰ واحد و قبض و پرداخت و صندوق و دورهٔ مدیریت و جلسه؛ پشتیبان کامل ← پاک کردن ←
بازیابی ← مقایسهٔ ستون‌به‌ستون همهٔ داده‌ها؛ بازیابی فایل‌های پشتیبان نسخه‌های قدیمی؛ رد شدن فایل‌های خراب یا دستکاری‌شده
بدون هیچ تغییری در داده؛ و زمان‌سنجی با ۱۰۰۰ تا ۱۰۰۰۰ قبض. در پایان یک جدول کوتاه «قبول/رد» و زمان‌ها چاپ می‌شود.

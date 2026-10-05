# Perf findings — Apartemant 1.7.8 (no app code changes)

**Method:** Chromium headless + CDP CPU throttle (4× and 6×), viewport 390×844, seeded via Capacitor Preferences → `localStorage`. Datasets from `perf/generate-dataset.mjs`. Oversized sets that exceed quota were micro-benched in Node (`perf/microbench.mjs`).

**Environment note:** This is a desktop Chromium approximation of a mid/low Android phone (CPU throttle only; no real device, no SharedPreferences I/O latency). Real phones may be slower on cold start and storage I/O.

---

## 1. Storage size & localStorage / WebView risk

| Profile | Bills | Units/bill | Unit rows | UTF-8 JSON | Seed in Chrome? |
|---|---:|---:|---:|---:|---|
| small-200x12 | 200 | 12 | 2 400 | 0.55 MB | OK |
| fit-500x12 | 500 | 12 | 6 000 | 1.41 MB | OK |
| cliff-450x20 | 450 | 20 | 9 000 | 2.01 MB | OK |
| mid-800x24 | 800 | 24 | 19 200 | 4.20 MB | OK (units key ≈ 3.8 M chars) |
| large-2000x20 | 2 000 | 20 | 40 000 | 8.94 MB | **QuotaExceededError** |
| large-5000x12 | 5 000 | 12 | 60 000 | 14.07 MB | **QuotaExceededError** |
| stress-5000x30 | 5 000 | 30 | 150 000 | 32.88 MB | impossible in WebView LS |
| stress-10000x20 | 10 000 | 20 | 200 000 | 45.30 MB | impossible in WebView LS |

**Quota probe (this Chrome):** a **single** `localStorage` value fails at **~5 M characters**. Multi-key origin total allowed more (~8–10 M chars observed). App stores **one giant JSON per table** (`bc.bills`, `bc.units`) via `@capacitor/preferences` (browser → localStorage; Android → SharedPreferences string).

**Risk:** A building with ~20–30 units and a few years of frequent bills will push the **`units` key** over ~5 MB first. At that point **saves/backups/imports fail** in WebView; on Android, SharedPreferences may accept larger strings but still risks ANR / TransactionTooLarge / slow IPC. Backup pretty-print of mid-800 is already **~7 MB**; stress-5000x30 backup **~55 MB** (over `MAX_BACKUP_BYTES` 20 MB).

---

## 2. Browser timings (CPU ×4)

| Measure | 200×12 | 500×12 | 450×20 | **800×24** |
|---|---:|---:|---:|---:|
| Startup → home ready | 1.5 s | 2.1 s | 2.1 s | **4.7 s** |
| Parse + join (in-page) | 41 ms | 145 ms | 226 ms | **894 ms** |
| · JSON.parse only | 11 ms | 26 ms | 30 ms | 57 ms |
| · join **naive** (app pattern) | 20 ms | 112 ms | 184 ms | **819 ms** |
| · join **Map index** | 5 ms | 4 ms | 6 ms | **13 ms** |
| Records open (cards) | 0.30 s (81) | 0.46 s (104) | 0.47 s (86) | **1.11 s (191)** |
| Records scroll (12 steps) | 0.58 s | 0.59 s | 0.58 s | 0.59 s |
| Reports hub | 0.10 s | 0.21 s | 0.27 s | **0.83 s** |
| Yearly / monthly / detail / charts | ~0.45–0.53 s | ~0.48–0.57 s | ~0.49–0.57 s | ~0.50–0.63 s |
| Debtors | 0.62 s | 0.86 s | 1.10 s | **1.23 s** |
| Bill payments | 0.57 s | 0.61 s | 0.68 s | 0.67 s |
| **Debtors pay preview** | 1.4 s (131 lines) | 2.2 s (322) | 2.7 s (277) | **4.3 s (497 lines)** |
| Backup serialize (pretty) | 43 ms | 103 ms | 141 ms | 277 ms |
| Backup parse (file → JSON) | 161 ms | 391 ms | 560 ms | **1.2 s** |
| New bill open | 0.35 s | 0.33 s | 0.41 s | 0.36 s |
| JS heap after debtors (used) | ~12 MB | ~20 MB | ~17 MB | ~29 MB |
| JS heap after new-bill (used) | ~18 MB | ~21 MB | ~24 MB | **~91 MB** |

### CPU ×6 (mid-800×24 only) — closer to low-end phone

| Measure | ×6 |
|---|---:|
| Startup → home | **5.1 s** |
| Parse + join | **1.3 s** |
| Records open | **1.7 s** |
| Reports hub | **1.3 s** |
| Debtors | **1.5 s** |
| **Debtors pay preview** | **6.8 s** |
| Backup parse | **1.8 s** |

---

## 3. Node microbench (oversized — cannot seed WebView)

| Dataset | Parse | Join naive | Join Map | Debtors-like (indexed) | Backup stringify |
|---|---:|---:|---:|---:|---:|
| 800×24 | 22 ms | 192 ms | 1 ms | 90 ms* | 60 ms / 7 MB |
| 2000×20 | 43 ms | **1043 ms** | 2 ms | 544 ms* | 102 ms / 15 MB |
| 5000×12 | 72 ms | **3944 ms** | 3 ms | 2193 ms* | 169 ms / 24 MB |
| 5000×30 | 210 ms | skipped (~750 M ops) | **10 ms** | **27 ms** | 386 ms / 56 MB |
| 10000×20 | 305 ms | skipped (~2 B ops) | **17 ms** | **39 ms** | 704 ms / 76 MB |

\*Older debtors bench included a leftover nested scan; indexed-only on 5000×30 is ~27 ms — shows indexing wins.

**Extrapolation:** Current `withUnits` (`units.filter(u => u.billId === bill.id)` per bill) on 5000×30 would be on the order of **tens of seconds** on a throttled phone CPU before any React render.

---

## 4. Bottlenecks (ranked)

1. **Monolithic Preferences JSON (`bc.units` especially)** — hard ceiling ~5 M chars/key; mid-size buildings already near it; 2 000+ bills with 20 units **cannot load** in browser WebView.
2. **O(B×U) join in `billRepository.withUnits`** — dominates load: 819 ms of 894 ms at 800×24 (×4); ~63× slower than a Map index.
3. **Debtors pay preview (`UnitPaymentScreen`)** — 4.3 s (×4) / 6.8 s (×6) with hundreds of allocation lines rendered at once (497 DOM rows).
4. **Full list render on Records** — no windowing; 191 cards at 800×24 default year filter still ~1.1–1.7 s to open.
5. **Reports hub open** scales with data (0.1 s → 0.8–1.3 s) even though hub UI is small — likely `getAll()` + join cost on every screen mount.
6. **Pretty-printed backup** (`JSON.stringify(..., null, 2)`) — large CPU + file size; 800×24 → ~7 MB; stress sets exceed 20 MB `MAX_BACKUP_BYTES`.
7. **Heap spikes** after navigating heavy screens / new bill (~91 MB used at mid-800) — risk of GC jank on low-RAM devices.
8. **Every screen re-fetches + re-joins all bills** (`getAll` / `getAllWithDeleted` in `useEffect`) — no shared normalized store / selector cache.

Monthly/chart reports stayed ~0.5–0.8 s even at mid size (they filter to one month/year) — less urgent than debtors + join + storage.

---

## 5. Proposed optimizations (do not implement yet)

| # | Change | Est. benefit | Effort |
|---|---|---|---|
| 1 | **Index units by `billId` once** in `billRepository.load()` (Map); replace `withUnits` filter | **~50–100×** faster join (819 ms → ~13 ms at 800×24); unlocks 5 k–10 k bill CPU path | S |
| 2 | **Chunked / non-Preferences storage** (SQLite via Capacitor community plugin, or IndexedDB wrapper) instead of one JSON blob | Removes **5 MB cliff**; enables 5 k–10 k bills; faster partial reads | L |
| 3 | Until (2): **compact JSON** (no pretty backup by default; optional minify), strip null fields, store payments more densely | ~30–50% size ↓; delays quota failure | S |
| 4 | **Shared in-memory store** (load once, `onChange` notify); screens select slices | Hub/Records remounts skip re-parse/re-join; startup paid once | M |
| 5 | **Records list virtualization** (window ~20–30 rows) | Faster first paint & scroll with 200+ cards; less DOM/memory | M |
| 6 | **Debtors pay preview: virtualize alloc lines** + compute allocation lazily / paginate | Cut 4–7 s preview toward &lt;1 s for heavy debtors | M |
| 7 | **Memoize report pure functions** by `(billsRef, filters)` | Helps monthlyDetail/debtors when toggling filters | S |
| 8 | **Year/month scoped queries** at repository layer (don’t join all history for monthly report) | Monthly/detail stay flat as history grows | M |
| 9 | **Backup: streaming / chunked export**, binary or NDJSON; raise or sensibly enforce size UX | Avoid 20 MB wall & multi-second stringify on mid data | M |
| 10 | **Migration path**: detect near-quota (`units` chars &gt; 3.5 M) and warn + offer “archive closed years” | Prevents silent save failures before (2) ships | S |

**Suggested order:** (1) indexing → (4) shared store → (5)(6) virtualization → (3) compact backup → (2) real DB when product needs &gt;~1 k bills × 20 units.

---

## 6. How to reproduce

```bash
cd app
node perf/generate-dataset.mjs && node perf/generate-dataset.mjs --extra
npm run build && python3 -m http.server 4180 -d dist
# symlink playwright once: ln -sfn /path/to/playwright/node_modules perf/node_modules
node perf/run.mjs --probe-quota --cpu 4
node perf/run.mjs --profile mid-800x24 --cpu 6
node perf/microbench.mjs
```

Artifacts: `perf/results/*`, `perf/data/*.meta.json` (large JSON gitignored).


---

## 7. After 1.7.9 optimizations

See `FINDINGS-1.7.9.md` for the full before/after table. Highlights (CPU ×4, mid-800×24): startup 4.7s→1.29s; Records 1.11s/191 cards→0.36s/20 (virtualized); hub 0.83s→0.10s; debtors-pay 4.3s/497 lines→2.44s/24 lines; compact backup ~7MB→4.0MB. large-5000 and stress-10000 now seed via IndexedDB (were QuotaExceeded / impossible on Preferences).

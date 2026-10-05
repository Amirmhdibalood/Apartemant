# Perf findings — Apartemant 1.7.9 (after optimizations)
Compared to 1.7.8 FINDINGS (Preferences + naive join). Seed is IndexedDB-direct; **startup numbers below use `tReady` (nav→home), not harness seed time**.
Environment: Chromium headless, CDP CPU throttle, viewport 390×844.

## Before → After (CPU ×4)

| Measure | mid-800×24 before | mid-800×24 after | large-5000×12 after | stress-10000×20 after |
|---|---:|---:|---:|---:|
| Startup → home ready (s) | 4.7 | 1.29 | 2.28 | 1.88 |
| Join Map index (ms) | 13 | 14 | 41.1 | 87 |
| Records open (s) / cards | 1.11 / 191 | 0.36 / 20 | 0.25 / 20 | 0.28 / 20 |
| Reports hub (s) | 0.83 | 0.1 | 0.11 | 0.28 |
| Debtors report (s) | 1.23 | 1.33 | 4.56 | 10.49 |
| Debtors pay preview (s) / DOM lines | 4.3 / 497 | 2.44 / 24 | 10.73 / 24 | 23.16 / 24 |
| Backup size (MB, compact after) | ~7 pretty | 4.03 | 13.55 | 43.56 |
| Seed into browser | LS OK | IDB OK | IDB OK (was QuotaExceeded) | IDB OK (was impossible) |

### CPU ×6 mid-800×24

| Measure | before | after |
|---|---:|---:|
| Startup → home | 5.1 s | 1.89 s |
| Records open | 1.7 s | 0.34 s (20 cards) |
| Reports hub | 1.3 s | 0.15 s |
| Debtors pay preview | 6.8 s | 6.4 s (24 lines) |

### large-5000 / stress-10000 CPU ×6

- **large-5000x12**: ready=4.8s, records=0.49s/20, hub=0.37s, debtors=5.35s, pay=12.4s, bak=13.55MB
- **stress-10000x20 ×6**: ready=6.09s, records=0.39s/20, hub=0.15s, debtors=15.12s, pay=29.36s, bak=43.56MB

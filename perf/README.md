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

# SQLite storage (from 1.8.0)

از نسخهٔ **۱.۸.۰** دادهٔ دامنهٔ برنامه (ساختمان، قبض، واحد، پرداخت، صندوق، دورهٔ مدیریت، جلسه) در یک **دیتابیس مستقل SQLite** نگه داشته می‌شود — نه به‌عنوان جداول دامنه در IndexedDB.

## Approach

- Engine: **[sql.js](https://sql.js.org/)** (SQLite compiled to JS; `sql-asm.js` so Vitest/Node needs no `.wasm` path).
- Why not `@capacitor-community/sqlite` for phase-1: Vitest runs in Node without jeep-sqlite DOM; Cap 8 sync would need a native Android step before we had green tests. sql.js still produces a real SQLite database file.
- Persistence:
  - **Android (Capacitor native):** `apartemant.db` under `@capacitor/filesystem` `Directory.Data`.
  - **Web / Vitest:** in-memory with optional opaque file blob in IndexedDB `apartemant-sqlite-file` (bytes of the `.db` only — not domain object stores).
- Settings / theme / split defaults stay on Preferences (`kvStore`) for this MVP.

## Migration

1. Legacy Preferences `bc.bills` / `bc.units` → IndexedDB (1.7.9 path, still used as a source).
2. IndexedDB (or empty) → SQLite: one default building (`fund_enabled = 0`), bills + units + flattened `payments`, optional unit templates from Preferences `building`.
3. Idempotent via `app_meta.sqliteMigration = done`.

## Android sync note

No new native plugin. After pull: `npm i && npm run android:sync` (existing Capacitor Filesystem is enough).

## Fund rule (locked)

When `buildings.fund_enabled = 1` and a bill has `expense_type = building`, each payment row creates a matching `fund_entries` deposit (`reason = charge_bill`). Removing payments rebuilds/clears those deposits.

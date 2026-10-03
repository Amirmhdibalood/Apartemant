# Full project briefing for "Apartemant" (for any AI coding assistant)

> Describes the project up to **v1.7.0 (versionCode 23)**. It contains no passwords, tokens or keys. (Persian original: `PROJECT-PROMPT-fa.md`.)

## 1) Purpose and user
"آپارتمانت" (Apartemant; package id `ir.buildingcharge.app`) is a **fully offline, Persian (RTL) Android app** for a **building manager**. It records shared bills (water, electricity, gas, building charge, cleaning, repairs, beautification, misc), splits each one fairly across the units, tracks every unit's payments, and reports (yearly costs, debtors, per-unit payment history, bill-payment timing). A bill can be shared as an image (e.g. to the building's Telegram group). It requests **no Android permissions at all** (not even internet), has no accounts and no server; all data lives on the phone and moves between phones via a JSON backup file.
The user (Raidana System / developer AmirMahdi Balood) speaks Persian and cares intensely about the maths: **the sum of unit shares must always equal the bill total exactly**.

## 2) Stack
- React 19 + TypeScript 5.9 + Vite 8, no UI library, no router (stack navigation in `src/navigation.ts` and `App.tsx`).
- Capacitor 8 (Android); plugins `app`, `filesystem`, `preferences`, `share`, `splash-screen`. Key/value storage via `@capacitor/preferences` behind `src/storage/kvStore.ts`; in a browser it falls back to `localStorage` with prefix `bc.`.
- Vazirmatn font bundled in the APK; own Jalali (Persian) calendar implementation (`src/logic/jalali.ts`).
- Tests: Vitest 5 (`npm test`), node environment, no jsdom (components are tested with `renderToStaticMarkup`). **478 tests in 42 files** (1.7.0).
- Android: minSdk 24, **compileSdk 36, targetSdk 36**, no minification, Node ≥ 22.12, JDK 21.

## 3) Repository layout (only the `app/` folder is under git)
```
src/
  main.tsx, App.tsx, navigation.ts, appVersion.ts
  models/        types.ts (Bill, Unit, Payment, BillDraft, ...) and constants.ts (expense types, months, colours, tile layout)
  logic/         pure, testable logic (no UI/storage): calculation, split, area, billFactory, validation, payments, settlement,
                 debts, report, billFilter, billPaymentReport, billPaid, billStatus, dueAlerts, building, backup, backupExport,
                 entryPrefs, iconPrefs, areaMode, notifMode, accordionState, popoverAnchor, years, settings, jalali, date, formatting, theme, darkColor, typeColor, ...
  storage/       kvStore + repositories (bill, backup, building, settings, splitDefaults, theme, onboarding, areaMode, notifMode, iconPrefs, entryPrefs)
  context/       Settings, Feedback (toast/dialog), Theme, AreaMode, IconPrefs, EntryPrefs, Notif
  components/    Accordion, AppHeader, UnitsEditor, BuildingSection, BackupSection, OptionPicker/SelectField/JalaliDateField (unified bottom-sheet pickers), Switch, ...
  screens/       Home, NewBill, Result, BillDetails, Records, Reports (+ reports/*), UnitHistory, Settings, Tutorial, Intro
  services/      backupFile (share/save file), billImage / billImageExport (bill picture)
  styles/        global.css (light theme, the source of truth) + dark.css (manual) + dark.generated.css (generated)
scripts/         dark-css.mjs / dark-art.mjs (dark theme generator), sign-release.mjs (signing), apply-android-branding.mjs, manifest-permissions.mjs
tests/           33 Vitest files
docs/theme-ideas 4 dark palettes designed for possible future multi-theme support
resources/       branding/icons and a custom MainActivity (edge-to-edge)
```
Outside the repo (in `/workspace/building-charge`): `SPEC-fa.md` (per-version spec), `myket/` (Myket texts and upload package), `screenshots/changes-*/`, `keystore/` (**never put it in the repo or a zip**), APKs.

## 4) Data model
- **Bill**: `id, year (Jalali), month (1..12), expenseType, billNumber?, description?, totalAmount (integer toman), createdAt (ISO), isFullySettled, splitMethod? ('perPerson'|'perUnit'|'perArea'; absent = perPerson), billPaid?, billPaidDate? ('1405-07-15'), dueDate? (Jalali), deletedAt? (soft delete)`.
- **Unit** (one unit's share in one bill — a per-bill snapshot): `id, billId, unitNumber, personCount (0 = vacant), alias?, vacant?, area? (m², up to 3 decimals, area bills only), shareAmount, isSettled (always derived from the remaining amount), payments? [{id, amount, paidAt|null}]`. A legacy unit with only `isSettled=true` means one full payment with unknown date.
- **Building settings** (`building`): `units[{alias, defaultPersons, vacant?, area?}]`; pre-fills the new-bill form; changing it affects **only future bills** (saved bills keep their own snapshot).
- **kvStore keys**: `bills, units, schemaVersion (=2), settings (activeYears, showSaveWarning, dismissedWarnings), building, splitDefaults (last method per type), theme, darkPalette, tutorialSeen, areaMode, notifMode, unitIcon, areaIcon, entryPrefs, lastBackupAt, safetyBackup`. Only bills/units/settings/building/splitDefaults go into backups; **appearance prefs (theme, dark palette, icons, …) and `entryPrefs` are deliberately outside backups**.

## 5) Backup format (`apartemant-backup-YYYY-MM-DD.json`, `src/logic/backup.ts`)
`{app:"apartemant", backupVersion, appVersion, createdAt, data:{bills, units, settings, building?, splitDefaults?}}` — current **version 7**; versions 1–7 are restorable, newer ones are rejected.
v1 (1.1) base • v2 (1.2) `payments` + `unitTemplate` • v3 (1.3) `splitMethod`, `splitDefaults` • v4 (1.5) `billPaid/billPaidDate/dueDate/deletedAt` • v5 (1.6.0) `building` + `alias`, persons 0 = vacant; v1–v4 files derive the building from the newest non-deleted bill • v6 (1.6.3) `vacant` • v7 (1.6.5) `area` + `perArea`.
Strict validation on restore: structure, duplicate ids, **per-bill share sum = bill total**, payments ≤ share, area present for area bills, max 20 MB. Restore first takes a safety copy of the current state (undoable). The "backup succeeded" message appears only when the share sheet actually reached a target / the file was written with the expected size (`backupExport.ts`).

## 6) Exact calculation rules (the heart of the app; `calculation.ts`, `split.ts`, `area.ts`)
**Weight per unit** (a vacant unit counts neither as a unit nor its occupants — in every count and calculation: bill image, "N of M units settled", the "Units (N)" title, debtors/history; tables and the bill image print "خالی" (Vacant) instead of the occupant count or area — `src/logic/vacant.ts`; it has weight 0 in all three methods: share 0, debt 0, and it never receives a leftover toman):
- per person: `w = personCount`; per unit: `w = 1` (real persons are still stored); per area: `w = round(area × 1000)` (integer thousandths of m²; missing area on a non-vacant unit = default 1; invalid such as 0 blocks saving).
**Largest-remainder (Hamilton) method in BigInt** for total `T` (positive safe integer) and `W = Σ w`:
1. `base_i = ⌊T·w_i / W⌋`, `frac_i = (T·w_i) mod W`.
2. `R = T − Σ base_i` (always `0 ≤ R <` number of units with weight).
3. Give +1 toman to the `R` weighted units with the largest `frac`; ties → lower unit number (deterministic).
Result: `Σ share_i = T` exactly; each share is between floor and ceil of the exact value; never NaN/negative. Errors if `T` is non-integer/≤0/unsafe, the unit list is empty, persons are negative/fractional, or `W = 0`. "Price per person / unit / m²" is informational only (`T/W`).
**Input**: Persian/Arabic/ASCII digits and thousands separators are accepted and normalised to ASCII (`formatting.ts`); area: decimal marks "٫ ، , /" → ".", max 3 decimals and 6 integer digits, ≤ 100,000.
**Validation** (`validation.ts`): amount, type, month/year, persons per unit (irrelevant for per-unit/area), area, "all vacant" and "no persons" are errors.
**Payments** (`payments.ts`): remaining = `max(0, share − Σ payments)`; `isSettled ⇔ remaining = 0`; a payment must be an integer, > 0 and ≤ remaining; "settle fully" pays the whole remainder; editing a bill keeps payments and re-evaluates settlement against the new share. A bill marked "paid" (the manager paid the utility company) cannot be deleted; soft delete (`deletedAt`) keeps data but removes the bill from every report/total until restored.
**Reports (1.7.0)**: a list + a separate page per report (`reportCatalog.ts`); "Monthly bills total" / "with details" (`monthlyTotals.ts`: each unit's share across all bills of the month; vacant = "vacant"; unit sums = bill totals); "Chart report" (`chartReport.ts`, SVG only); Save / Share / Print per report (`reportDoc.ts` → `reportImage.tsx` → `pdf.ts` (own image-only PDF writer, no jsPDF) + native plugin `ReportPrint` using PrintManager, no permission); Settings → "Show reports" (`reportPrefs.ts`, key `reportPrefs`, outside the backup). The developer name/email are hidden for now (`appVersion.ts`, TODO).
**Reports**: yearly (`report.ts`: grand total, by type and month, percentages with one decimal, paid + remaining = total); debtors (`debts.ts`: only remaining > 0); per-unit payment history (grace 7 days, rating good/average/bad by on-time ratio ≥ 80% / ≥ 50%); bill payments (early / on due date / late + status filter). Alerts start **2 days before the due date** (in 2 days, tomorrow, today, overdue).
**Disabled types/methods** (`entryPrefs.ts`, since 1.6.8): a disabled type disappears from the form, filters, all reports, lists, alerts and totals, and comes back when re-enabled (no data deleted); a disabled method is hidden only in the form's picker; at least one of each group stays on; when editing, the bill's own type/method is still shown.
Limitation: aggregate sums beyond `Number.MAX_SAFE_INTEGER` (≈ 9 quadrillion toman) lose precision in reports (unrealistic; per-bill maths is exact).

## 7) UI rules
- **Everything Persian and RTL** (`body{direction:rtl}`), Persian digits for display, "٬" thousands separator; short, fluent copy.
- Mobile layout (max 520px), **no horizontal scrolling at all** (`html{overflow-x:hidden}`, `body,#root{overflow-x:clip}`, `touch-action:pan-y`); verify at 360 and 390px (`scrollWidth === clientWidth`).
- **Shared header** (`AppHeader`): on screen, left→right: **back, theme toggle, "?" help, bell**; the DOM order is reversed because of RTL; the grid is `auto 1fr auto`. Home has no back: theme, "?", bell. The notification panel anchors under the real bell (`popoverAnchor`) or falls back to a bottom sheet.
- **Theme**: the light theme lives in `global.css` (CSS variables); the **dark theme is generated and parameterised (since 1.6.12)** and the **light theme has 5 palettes (since 1.6.13: `lightPalettes.ts` + `lightColor.ts`; "Sky" = untouched `global.css`, the others are written in full under `:root[data-theme="light"][data-light="…"]` into `light.generated.css`; `ThemeProvider` sets `data-light`; the bill image uses `billImageColors`)**: palettes live in `src/logic/darkPalettes.ts` (bg/card lightness, neutral hue, text saturation, accent hue and per-palette "manual" colours), colour mapping in `darkColor.ts`, and `npm run theme:generate` writes `dark.generated.css`: the default palette (deep navy) under `:root[data-theme="dark"]`, every other palette as a diff only under `:root[data-theme="dark"][data-palette="…"]`; night intro art is generated per palette too. Manual rules in `dark.css` use palette variables only (`--primary-fill`, `--sw-off-bg`, …) with a `[data-palette]` selector. Any change to `global.css` or the palettes requires re-running it (tests enforce sync and per-palette contrast). The 4 palettes: **Deep navy** (default), **Neutral charcoal**, **AMOLED black**, **Warm brown** (teal accent). `ThemeProvider` applies `theme` + `palette` to `<html data-theme data-palette>`, the meta colour and the status-bar style; first launch follows `prefers-color-scheme`. Exported bill images are always light and take the chosen light palette (`data-light`). Components with inline colours must take `palette` from `useTheme()/useAdapt()`. Water colour: `#14307A` (light) / `#B6D4FF` (dark, navy palette).
- Month/year/date/filters use the unified `OptionPicker` bottom sheet (no native `<select>`). Expense types are coloured 3-per-row tiles.
- **Settings** (all accordions, collapsed by default, state per session only): 1) Years 2) Building (unit count, alias, persons, vacant, area) 3) Bill types and calculation methods 4) Appearance (**Theme** [1.6.12: collapsible "Dark" with 4 palettes + collapsible "Light" with 5 palettes], area display mode, unit icon, area icon, notification display) 5) Alerts 6) Backup & restore; version/developer lines stay visible below. Light/dark can be switched from the header button and from the "Theme" group (kept in sync).
- A first-run tutorial, re-openable via "?".

## 8) Feature history (1.0 → 1.7.0)
- **1.0.0** bill entry, per-person split with largest remainder • **1.1.0** backup/restore • **1.2.0** reports, partial payments, remembered units, 3 new types (backup v2) • **1.3.0** per-unit split, internet permission removed (v3) • **1.4.0** shareable bill image, edge-to-edge.
- **1.5.0** "bill paid", due dates, status colours, filters, soft delete, bill-payments report (v4) • **1.5.1** system notifications and all permissions removed; in-app alert card.
- **1.6.0** Building settings, alias, vacant units, snapshots (v5) • **1.6.1** new personal signing key • **1.6.2** unified pickers • **1.6.3** first-run tutorial, "?", dark mode, vacant flag (v6) • **1.6.4** water colour, notification centre (bell), payment-status filter • **1.6.5** per-area split (3-decimal areas), area display mode (v7) • **1.6.6** honest backup message, clearer switches in dark, default area 1 • **1.6.7** selectable unit and area icons • **1.6.8** toggles for bill types and methods (affects reports) • **1.6.9** Settings restructure + "Appearance" section + header overflow fix • **1.6.10** accordion Settings, horizontal-scroll fix • **1.6.11** header button order (left→right: back, theme, "?", bell) and bell panel anchor • **1.6.12** "Theme" group (4 dark palettes, parameterised generator, stored in `darkPalette` outside backups) + vacant-unit fix (counts neither as a unit nor its occupants; "Vacant" instead of a number). • **1.6.13** light theme with 5 palettes (Sky [default], Warm paper, Cool mint, Slate lavender, Cool gray high-contrast; stored in `lightPalette`, outside the backup; `light-css`/`light-art` generators) • **1.6.14** fix: a bill without a due date is classified by paid status only in the bill-payments report (new "Unpaid (no due date)" timing, new "Paid" filter chip, always `paid + unpaid = total`); records summary shows paid and unpaid counts • **1.7.0** reports hub (list + page per report), "Monthly bills total" (+ details), SVG "Chart report" (bar/line/pie), Save/Share/Print (JPEG or PDF A4/A5/normal) on every report, Settings → "Show reports", developer name/email hidden (TODO)

## 9) Build, sign, release (no secrets)
1. `npm ci` → `npm run build` (tsc -b + vite build) → `npx cap sync android` (`npm run android:sync`).
2. `cd android && ./gradlew assembleRelease` (unsigned APK). The `android/` folder is not in the repo (created by `npx cap add android`, branded by `scripts/apply-android-branding.mjs`).
3. Sign: `node scripts/sign-release.mjs --out apartemant-X.Y.Z.apk` with env vars `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (zipalign + apksigner v1+v2+v3). **The key and passwords belong to the owner and are never committed or zipped.** Release certificate SHA-256: `e345788bd0445f6128671c08771238b8f687edc71bbedd7f85c99c8f03997715`. All updates must be signed with this same key.
4. Verify: `apksigner verify --print-certs --min-sdk-version 23`, `aapt dump badging` (only the internal `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`), `sha256sum`.
5. Each release: bump `versionCode`, update README, `SPEC-fa.md`, Myket texts (`myket/_src`) and both zips (no secrets); take real-app screenshots (light/dark, 360/390).
6. GitHub repo `Amirmhdibalood/Apartemant` (branch `main`): local history is merged in a temp clone using `git merge -X ours --allow-unrelated-histories`, trees are compared; never commit APKs, keystores, `node_modules` or secrets. The token is read only from the `GITHUB_TOKEN` environment variable.

## 10) Tests and quality
`npm test` (375 tests): split maths, area, validation, payments, reports, backups of every version, generated dark theme, Settings/header layout, and **seeded randomized tests** (`tests/qaRandom.test.ts`: 2000+ split cases with invariants, Persian/Arabic digit input, bill build/edit, payments, yearly/debtor reports with soft delete and disabled types, v7 backup round-trip and v1..v6 migration). Every logic change needs tests. UI checks: Playwright scripts with Chrome measuring horizontal overflow at 360/390px. There is no ESLint; typecheck is `tsc -b` inside the build.

## 11) Known limitations
- Android doesn't say whether the target app (e.g. Telegram) finished or cancelled a share; "success" means the share sheet reached a target.
- Restore uses `<input type=file>` (no native file-picker plugin).
- `allowBackup="true"` in the manifest (Google auto-backup); turn off if stricter privacy is wanted.
- Aggregates above ≈ 9×10¹⁵ toman are inexact. Charts (bar/line/pie) exist only in the "Chart report" (SVG).
- Google Play Protect / Xiaomi scanners may warn about a non-store APK ("install anyway").
- Myket: the 1.6.0 upload was rejected (old key); since 1.6.1 the new key is used and **nothing is published on Myket yet**; the ready package is in `myket/` (Persian/English texts, 1280×720 screenshots, privacy policy).

## 12) User workflow preferences (follow them)
- Talk in Persian; final reports **short**: test counts, SHA-256, paths.
- **One change at a time**, usually **show a mockup first** and get approval before implementing; never change calculations without approval.
- Each release = new version + versionCode + local commit + build/sign/verify + docs and zips updated + real-app screenshots. **Do not push to GitHub or create releases without an explicit request**; never send external messages.
- UI: calm and consistent, no overflow, button order exactly as the user wants (especially the header).
- If a real bug is found: ship a new version and say so explicitly.

## 13) Pending ideas
- (Done in 1.7.0: charts, PDF/JPEG print.) Verify native printing (PrintManager) on a real device; possibly a CSV export.
- A native file picker for backup restore and direct save into Documents.
- Light-theme variants and more palettes; 4 dark (1.6.12) and 5 light (1.6.13) palettes have shipped (original idea: `docs/theme-ideas`).
- Myket publication (resolve the earlier rejection/key) and Play Protect status; possibly Google Play.
- Configurable on-time grace period (currently fixed at 7 days), CSV export of reports.

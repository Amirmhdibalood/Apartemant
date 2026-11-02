/**
 * ۱.۸ — پشتیبان کامل (قالب ۹): همهٔ جدول‌ها، چند ساختمان، بازیابی اتمی، سازگاری با قالب‌های قدیمی،
 * رد فایل‌های دستکاری‌شده و نسخهٔ ایمنی بیرون از Preferences.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests, withSqlite } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { backupRepository, PREF_KEY_POLICY } from '../src/storage/backupRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { settingsRepository } from '../src/storage/settingsRepository';
import { BACKUP_COLUMN_COVERAGE, BACKUP_TABLE_COVERAGE, listSqliteTables } from '../src/storage/sqlite/fullBackup';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import {
  BACKUP_VERSION, MAX_BACKUP_BYTES, backupTooLargeWarning, createBackup, parseBackup, serializeBackup, type BackupData,
} from '../src/logic/backup';
import { dumpAllTables, dumpPrefs, seedScenario, type BuildingSpec } from './helpers/scenario';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

async function newPhone() {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
}

beforeEach(newPhone);

const SPECS: BuildingSpec[] = [
  { name: 'برج آفتاب', units: 5, bills: 12, fund: true },
  { name: 'مجتمع یاس', units: 20, bills: 9, fund: true, meetings: 3, fundTypes: ['building', 'repairs', 'misc'] },
  { name: 'ساختمان قدیمی', units: 7, bills: 4, archived: true, periods: 1 },
];

async function exportText(): Promise<string> {
  return serializeBackup(createBackup(await backupRepository.collect(), '1.8.0', new Date('2026-10-29T08:00:00Z')));
}

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('پوشش: هیچ جدول یا کلیدی از پشتیبان جا نمی‌ماند', () => {
  it('هر جدول SQLite در BACKUP_TABLE_COVERAGE آمده است (جدول تازه بدون پشتیبان = شکست تست)', async () => {
    await buildingRepository.list();
    const tables = await withSqlite((db) => listSqliteTables(db));
    expect([...tables].sort()).toEqual(Object.keys(BACKUP_TABLE_COVERAGE).sort());
  });

  it('هر ستون هر جدول در BACKUP_COLUMN_COVERAGE آمده است (ستون تازه، حتی با مقدار پیش‌فرض = شکست تست)', async () => {
    await buildingRepository.list();
    const cols = await withSqlite((db) => {
      const out: Record<string, string[]> = {};
      for (const t of listSqliteTables(db)) {
        if (t === 'app_meta') continue;
        const r = db.exec(`PRAGMA table_info(${t})`);
        out[t] = (r[0]?.values ?? []).map((v) => String(v[1])).sort();
      }
      return out;
    });
    const declared = Object.fromEntries(Object.entries(BACKUP_COLUMN_COVERAGE).map(([t, c]) => [t, c.map((x) => x.split(':')[0]).sort()]));
    expect(cols).toEqual(declared);
    expect(cols.buildings).toContain('fund_types');
  });

  it('هر کلید kvStore در src/storage طبقه‌بندی شده است (پشتیبان / ترجیح گوشی / داخلی)', () => {
    const keys = new Set<string>();
    for (const f of readdirSync('src/storage').filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(`src/storage/${f}`, 'utf8');
      if (!/from '\.\/kvStore'/.test(src)) continue;
      for (const m of src.matchAll(/const [A-Z_]*(?:KEY|PREFIX)[A-Z_]* = '([^']+)'/g)) keys.add(m[1]);
      for (const m of src.matchAll(/(?:readJson|writeJson|removeKey)(?:<[^>]*>)?\('([^']+)'/g)) keys.add(m[1]);
    }
    keys.delete('bc.'); // namespace prefix of Preferences itself (legacy bc.bills/bc.units are migrated into SQLite)
    expect(keys.size).toBeGreaterThan(10);
    for (const k of keys) expect(PREF_KEY_POLICY, `kv key "${k}"`).toHaveProperty([k]);
  });
});

describe('پشتیبان کامل چندساختمانی: گرفتن → گوشی جدید → بازیابی → همه‌چیز یکسان', () => {
  it('همهٔ جدول‌ها ستون‌به‌ستون و تنظیمات یکسان برمی‌گردند؛ هر ساختمان سر جای خودش', async () => {
    const ids = await seedScenario(SPECS);
    const before = await dumpAllTables();
    const beforePrefs = await dumpPrefs();
    // دادهٔ واقعی در همهٔ جدول‌ها هست
    for (const t of Object.keys(BACKUP_TABLE_COVERAGE)) if (t !== 'app_meta') expect(before[t]?.length, t).toBeGreaterThan(0);

    const text = await exportText();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.backup.backupVersion).toBe(BACKUP_VERSION);
    expect(parsed.summary.buildings).toBe(3);
    expect(parsed.summary.meetings).toBe(7);
    expect(parsed.summary.managementPeriods).toBe(5);

    await newPhone();
    await backupRepository.replaceAll(parsed.backup.data);
    billRepository._resetCache();
    expect(await dumpAllTables()).toEqual(before);
    expect(await dumpPrefs()).toEqual(beforePrefs);
    expect(await buildingRepository.getActiveId()).toBe(ids[1]);
    expect((await billRepository.getAll()).every((b) => b.bill.id.startsWith('s1-'))).toBe(true);
    expect(await buildingRepository.getFundBalance(ids[1])).toBeGreaterThan(0);

    // و دوباره: پشتیبانِ بازیابی‌شده همان متن را می‌دهد
    expect(await exportText()).toBe(text);
  });

  it('بازیابی روی گوشی‌ای که دادهٔ دیگری دارد، آن را کامل جایگزین می‌کند (نه ادغام، نه انتقال به ساختمان پیش‌فرض)', async () => {
    await seedScenario(SPECS);
    const before = await dumpAllTables();
    const text = await exportText();
    await newPhone();
    await seedScenario([{ name: 'دیگر', units: 3, bills: 5, fund: true }, { name: 'دوم', units: 4, bills: 2 }], 99);
    const r = parseBackup(text);
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    expect(await dumpAllTables()).toEqual(before);
  });
});

describe('بازیابی اتمی: هر خطا ← هیچ تغییری', () => {
  it('شکست نوشتن تنظیمات بعد از SQLite ← دیتابیس و تنظیمات قبلی برمی‌گردند', async () => {
    await seedScenario(SPECS.slice(0, 2));
    const text = await exportText();
    await newPhone();
    await seedScenario([{ name: 'فعلی', units: 4, bills: 6, fund: true }], 3);
    const before = await dumpAllTables();
    const beforePrefs = await dumpPrefs();
    const r = parseBackup(text);
    if (!r.ok) throw new Error(r.error);
    const spy = vi.spyOn(settingsRepository, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(backupRepository.replaceAll(r.backup.data)).rejects.toThrow('disk full');
    spy.mockRestore();
    billRepository._resetCache();
    expect(await dumpAllTables()).toEqual(before);
    expect(await dumpPrefs()).toEqual(beforePrefs);
  });

  it('دادهٔ ناسازگار وسط تراکنش (واحد بدون قبض) ← تراکنش برمی‌گردد', async () => {
    await seedScenario([{ name: 'فعلی', units: 4, bills: 6, fund: true }]);
    const before = await dumpAllTables();
    const data = await backupRepository.collect();
    const broken: BackupData = { ...data, units: [...data.units, { ...data.units[0], id: 'orphan', billId: 'no-such-bill' }] };
    await expect(backupRepository.replaceAll(broken)).rejects.toThrow();
    expect(await dumpAllTables()).toEqual(before);
  });

  it('شناسهٔ تکراری پرداخت ← رد (هم در parse و هم در خود تراکنش)', async () => {
    await seedScenario([{ name: 'فعلی', units: 3, bills: 4 }]);
    const before = await dumpAllTables();
    const data = await backupRepository.collect();
    const paid = data.units.filter((u) => (u.payments?.length ?? 0) > 0);
    const dup = paid[1].payments![0].id;
    const broken = { ...data, units: data.units.map((u) => (u.id === paid[0].id ? { ...u, payments: [{ ...u.payments![0], id: dup }] } : u)) };
    await expect(backupRepository.replaceAll(broken)).rejects.toThrow();
    expect(await dumpAllTables()).toEqual(before);
    const r = parseBackup(serializeBackup(createBackup(broken, 'x')));
    expect(r.ok).toBe(false);
  });
});

describe('سازگاری با فایل‌های قدیمی (قالب ۱ تا ۸)', () => {
  it.each(['backup-v1.json', 'backup-v4.json', 'backup-v8.json'])('%s مثل قبل در ساختمان پیش‌فرض بازیابی می‌شود', async (name) => {
    const r = parseBackup(fixture(name));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.buildings).toBeUndefined();
    await backupRepository.replaceAll(r.backup.data);
    billRepository._resetCache();
    const all = await billRepository.getAllWithDeleted();
    expect(all.map((b) => b.bill.id).sort()).toEqual(r.backup.data.bills.map((b) => b.id).sort());
    const rows = await dumpAllTables();
    expect(rows.bills.every((b) => b[1] === DEFAULT_BUILDING_ID)).toBe(true);
    expect(rows.bill_units).toHaveLength(r.backup.data.units.length);
    expect((await buildingRepository.get(DEFAULT_BUILDING_ID)).units).toEqual(r.backup.data.building!.units);
  });

  it('قالب ۴: الگوی واحدها، پرداخت‌ها، پیش‌فرض تقسیم و قبض حذف‌شده حفظ می‌شوند', async () => {
    const r = parseBackup(fixture('backup-v4.json'));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const data = await backupRepository.collect();
    expect(data.splitDefaults).toEqual({ gas: 'perUnit' });
    expect(data.units.find((u) => u.id === 'f1u1')?.payments).toEqual([{ id: 'f1u1p1', amount: 100000, paidAt: '2025-04-01T08:00:00.000Z' }]);
    expect(data.bills.find((b) => b.id === 'f2')?.deletedAt).toBe('2025-05-01T08:00:00.000Z');
    expect(data.bills.find((b) => b.id === 'f1')?.billPaidDate).toBe('1405-01-20');
  });

  it('قالب ۸ با buildingId ناشناخته: قبض گم نمی‌شود و به ساختمان پیش‌فرض می‌رود؛ batchId و تلفن حفظ می‌شود', async () => {
    const r = parseBackup(fixture('backup-v8.json'));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const all = await billRepository.getAll();
    expect(all.map((b) => b.bill.id).sort()).toEqual(['g1', 'g2']);
    const g1 = all.find((b) => b.bill.id === 'g1')!;
    expect(g1.units[0].payments?.[0].batchId).toBe('bt-1');
    expect((await buildingRepository.get()).units[1].phone).toBe('09121234567');
  });

  it('فایل قدیمی روی گوشی چندساختمانی: ساختمان‌ها می‌مانند، قبض‌ها مثل قبل جایگزین می‌شوند', async () => {
    const ids = await seedScenario(SPECS.slice(0, 2));
    const r = parseBackup(fixture('backup-v1.json'));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const rows = await dumpAllTables();
    expect(rows.buildings.map((b) => b[0]).sort()).toEqual([...ids].sort());
    expect(rows.bills.map((b) => b[0])).toEqual(['o1']);
    // جلسه‌ها و دوره‌های مدیریت مثل قبل دست نمی‌خورند
    expect(rows.meetings.length).toBe(5);
    expect(rows.management_periods.length).toBe(4);
  });
});

describe('رد فایل‌های خراب یا دستکاری‌شدهٔ قالب ۹ (بدون هیچ تغییری در داده)', () => {
  const base = async () => { await seedScenario(SPECS.slice(0, 2)); return JSON.parse(await exportText()); };
  const cases: Array<[string, (o: any) => void]> = [
    ['بخش ناقص (فقط ساختمان‌ها)', (o) => { delete o.data.meetings; }],
    ['بدون ساختمان پیش‌فرض', (o) => { o.data.buildings = o.data.buildings.filter((b: any) => b.id !== 'building-default'); }],
    ['قبض بدون ساختمان', (o) => { delete o.data.bills[0].buildingId; }],
    ['قبض با ساختمان ناشناخته', (o) => { o.data.bills[0].buildingId = 'nope'; }],
    ['صندوق با ساختمان ناشناخته', (o) => { o.data.fundEntries[0].buildingId = '__proto__'; }],
    ['نوع صندوق ارثی', (o) => { o.data.fundEntries[0].kind = 'constructor'; }],
    ['مبلغ منفی صندوق', (o) => { o.data.fundEntries[0].amount = -5; }],
    ['ساعت جلسه ۲۵', (o) => { o.data.meetings[0].hour = 25; }],
    ['وضعیت حضور نامعتبر', (o) => { o.data.meetings[0].attendance[0].status = 'toString'; }],
    ['واحد تکراری در حضور و غیاب', (o) => { o.data.meetings[0].attendance.push({ ...o.data.meetings[0].attendance[0] }); }],
    ['متن بسیار بلند', (o) => { o.data.meetings[0].summary = 'x'.repeat(6000); }],
    ['نام ساختمان بسیار بلند', (o) => { o.data.buildings[0].name = 'x'.repeat(500); }],
    ['شناسهٔ تکراری ساختمان', (o) => { o.data.buildings.push({ ...o.data.buildings[0] }); }],
    ['شناسهٔ تکراری جلسه', (o) => { o.data.meetings.push({ ...o.data.meetings[0] }); }],
    ['دورهٔ مدیریت بدون نام', (o) => { o.data.managementPeriods[0].managerLabel = ''; }],
    ['ساختمان‌ها آرایه نیست', (o) => { o.data.buildings = { __proto__: { polluted: true } }; }],
    ['واحد ساختمان نامعتبر', (o) => { o.data.buildings[0].units = [{ alias: 5, defaultPersons: 'x' }]; }],
    ['حالت چندساختمانی نامعتبر', (o) => { o.data.multiBuilding = { enabled: 'yes', activeBuildingId: 1 }; }],
  ];
  it.each(cases)('%s', async (_label, mutate) => {
    const o = await base();
    const before = await dumpAllTables();
    mutate(o);
    const r = parseBackup(JSON.stringify(o));
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(await dumpAllTables()).toEqual(before);
  });

  it('حالت چندساختمانی با ساختمان ناموجود ← ساختمان پیش‌فرض', async () => {
    const o = await base();
    o.data.multiBuilding.activeBuildingId = 'gone';
    const r = parseBackup(JSON.stringify(o));
    expect(r.ok && r.backup.data.multiBuilding?.activeBuildingId).toBe(DEFAULT_BUILDING_ID);
  });
});

describe('حجم و نسخهٔ ایمنی', () => {
  it('سقف بازیابی بزرگ‌تر از پشتیبانِ ۱۰ هزار قبض × ۱۰۰ واحد است؛ هشدار فقط بالای سقف', () => {
    expect(MAX_BACKUP_BYTES).toBeGreaterThan(200 * 1024 * 1024);
    expect(backupTooLargeWarning('{"a":1}')).toBeNull();
    expect(backupTooLargeWarning('x'.repeat(2000), 1000)).toContain('مگابایت');
    expect(backupTooLargeWarning('ب'.repeat(400), 1000)).toBeNull(); // 800 bytes
    expect(backupTooLargeWarning('ب'.repeat(600), 1000)).not.toBeNull(); // 1200 bytes
  });

  it('نسخهٔ ایمنی کپی کامل است (نه رشته در Preferences) و همه‌چیز را برمی‌گرداند', async () => {
    await seedScenario(SPECS);
    const before = await dumpAllTables();
    const beforePrefs = await dumpPrefs();
    await backupRepository.saveSafetyBackup('1.8.0');
    expect([...prefs().keys()].some((k) => k.includes('safety'))).toBe(false);
    const info = await backupRepository.getSafetyInfo();
    expect(info?.bills).toBe(25);

    const r = parseBackup(fixture('backup-v1.json'));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    expect((await dumpAllTables()).bills).toHaveLength(1);

    const safety = await backupRepository.getSafetyBackup();
    expect(safety?.data.buildings).toHaveLength(3);
    await backupRepository.replaceAll(safety!.data);
    expect(await dumpAllTables()).toEqual(before);
    expect(await dumpPrefs()).toEqual(beforePrefs);
  });

  it('نسخهٔ ایمنی قدیمی (داخل Preferences تا ۱.۸.۰) هنوز خوانده می‌شود و با نسخهٔ تازه پاک می‌شود', async () => {
    prefs().set('bc.safetyBackup', JSON.stringify(fixture('backup-v4.json')));
    expect((await backupRepository.getSafetyInfo())?.bills).toBe(2);
    expect((await backupRepository.getSafetyBackup())?.data.bills).toHaveLength(2);
    await backupRepository.saveSafetyBackup('1.8.0');
    expect(prefs().has('bc.safetyBackup')).toBe(false);
    expect((await backupRepository.getSafetyInfo())?.bills).toBe(0);
  });

  it('hasUserData: فقط ساختمان دوم یا صندوق هم داده حساب می‌شود', async () => {
    expect(await backupRepository.hasUserData()).toBe(false);
    await buildingRepository.create('دوم', false);
    expect(await backupRepository.hasUserData()).toBe(true);
  });
});

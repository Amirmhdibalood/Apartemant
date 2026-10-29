/** Security review regressions: backup-file tampering, prototype keys, URL schemes, input caps. */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { Bill, Unit } from '../src/models/types';
import { DEFAULT_SETTINGS, EXPENSE_TYPES, isExpenseType } from '../src/models/constants';
import {
  MAX_BACKUP_BYTES, MAX_BACKUP_TEXT_LENGTH, MAX_BILL_NUMBER_LENGTH, MAX_DESCRIPTION_LENGTH,
  createBackup, parseBackup, serializeBackup,
} from '../src/logic/backup';
import { sanitizeSplitDefaults } from '../src/logic/split';
import { normalizeType } from '../src/logic/billFilter';
import { smsHref, telHref } from '../src/logic/contactActions';
import { buildSupportItems, cleanHandle } from '../src/logic/support';
import { sanitizeBuilding } from '../src/logic/building';

const bill: Bill = {
  id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null,
};
const unit: Unit = { id: 'u1', billId: 'b1', unitNumber: 1, personCount: 1, shareAmount: 1000, isSettled: false };
const validObj = () => JSON.parse(serializeBackup(createBackup({ bills: [bill], units: [unit], settings: DEFAULT_SETTINGS }, '1.8.0')));

describe('امنیت — فایل پشتیبان دستکاری‌شده', () => {
  it('نوع هزینهٔ ارثی (constructor/toString/__proto__/hasOwnProperty) رد می‌شود', () => {
    for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      const o = validObj();
      o.data.bills[0].expenseType = t;
      expect(parseBackup(JSON.stringify(o)).ok, t).toBe(false);
    }
    expect(parseBackup(JSON.stringify(validObj())).ok).toBe(true);
  });

  it('کلیدهای __proto__/constructor در JSON باعث آلودگی Object.prototype نمی‌شوند', () => {
    const raw = JSON.stringify(validObj())
      .replace('"data":{', '"data":{"__proto__":{"polluted":1},')
      .replace('"settings":{', '"settings":{"__proto__":{"polluted":2},"constructor":{"prototype":{"polluted":3}},');
    const withSplit = raw.replace('"data":{', '"data":{"splitDefaults":{"__proto__":"perUnit","constructor":"perUnit","water":"perUnit"},');
    const r = parseBackup(withSplit);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    if (r.ok) expect(Object.keys(r.backup.data.splitDefaults ?? {})).toEqual(['water']);
  });

  it('sanitizeSplitDefaults فقط کلیدهای واقعی نوع هزینه را می‌پذیرد', () => {
    const input = JSON.parse('{"__proto__":"perUnit","constructor":"perUnit","toString":"perArea","gas":"perUnit"}');
    const out = sanitizeSplitDefaults(input);
    expect(Object.keys(out)).toEqual(['gas']);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('isExpenseType / normalizeType فقط ۸ نوع واقعی', () => {
    for (const t of Object.keys(EXPENSE_TYPES)) expect(isExpenseType(t)).toBe(true);
    for (const t of ['constructor', '__proto__', 'toString', '', 'WATER', 1, null, {}]) {
      expect(isExpenseType(t)).toBe(false);
      expect(normalizeType(t)).toBeNull();
    }
  });

  it('فایل خیلی بزرگ، خالی، غیر JSON و متن‌های خیلی بلند رد می‌شوند', () => {
    expect(parseBackup(' '.repeat(10) + 'x'.repeat(MAX_BACKUP_BYTES)).ok).toBe(false);
    expect(parseBackup('').ok).toBe(false);
    expect(parseBackup('{"app":').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    const o = validObj();
    o.data.bills[0].description = 'x'.repeat(MAX_BACKUP_TEXT_LENGTH + 1);
    expect(parseBackup(JSON.stringify(o)).ok).toBe(false);
    const o2 = validObj();
    o2.data.bills[0].id = 'x'.repeat(201);
    expect(parseBackup(JSON.stringify(o2)).ok).toBe(false);
    const o3 = validObj();
    o3.data.units[0].payments = Array.from({ length: 1001 }, (_, i) => ({ id: 'p' + i, amount: 1, paidAt: null }));
    expect(parseBackup(JSON.stringify(o3)).ok).toBe(false);
  });

  it('مبالغ غیرعادی (منفی، اعشاری، بزرگ‌تر از عدد صحیح امن) رد می‌شوند', () => {
    for (const v of [-1, 0.5, Number.MAX_SAFE_INTEGER + 2, '1000', 1e400]) {
      const o = validObj();
      o.data.bills[0].totalAmount = v;
      expect(parseBackup(JSON.stringify(o)).ok, String(v)).toBe(false);
    }
  });

  it('شماره تلفن واحد در پشتیبان فقط رقم نگه داشته می‌شود', () => {
    const b = sanitizeBuilding({ units: [{ alias: '<img src=x onerror=alert(1)>', defaultPersons: 1, phone: 'javascript:alert(1)//0912' }] });
    expect(b!.units[0].phone).toBe('10912');
  });
});

describe('امنیت — لینک‌های بیرونی', () => {
  it('tel:/sms: از ورودی کاربر فقط رقم می‌گیرند (بدون javascript: یا پارامتر اضافه)', () => {
    expect(telHref('javascript:alert(1)')).toBe('tel:1');
    expect(telHref('0912 123-4567')).toBe('tel:09121234567');
    const h = smsHref(['0912;?body=x', 'javascript:0913'], 'سلام & <b>?body=');
    expect(h.startsWith('sms:0912,0913?body=')).toBe(true);
    expect(h).not.toMatch(/javascript|<|&b/);
  });

  it('لینک‌های پشتیبان فقط https://t.me و https://ble.ir و mailto/tel امن می‌سازند', () => {
    expect(cleanHandle('javascript:alert(1)')).toBeNull();
    expect(cleanHandle('https://evil.com/x')).toBeNull();
    const items = buildSupportItems({ email: 'a@b.ir?bcc=x', phone: 'tel:+98912;x', bale: 'javascript:alert(1)', telegram: '@ApartemantSupportBot' });
    for (const it of items) expect(it.href).toMatch(/^(https:\/\/(t\.me|ble\.ir)\/|mailto:|tel:)/);
    expect(items.map((i) => i.id)).toEqual(['telegram']);
  });
});

describe('امنیت — کد منبع', () => {
  const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

  it('فرم قبض سقف طول دارد (کمتر یا برابر سقف بازیابی تا هر قبض ذخیره‌شده قابل بازیابی بماند)', () => {
    const s = src('screens/NewBillScreen.tsx');
    expect(s).toContain('maxLength={MAX_BILL_NUMBER_LENGTH}');
    expect(s).toContain('maxLength={MAX_DESCRIPTION_LENGTH}');
    expect(MAX_BILL_NUMBER_LENGTH).toBeLessThanOrEqual(MAX_BACKUP_TEXT_LENGTH);
    expect(MAX_DESCRIPTION_LENGTH).toBeLessThanOrEqual(MAX_BACKUP_TEXT_LENGTH);
  });

  it('هیچ dangerouslySetInnerHTML / eval / new Function در برنامه نیست', () => {
    const hits = execSync('grep -rlE "dangerouslySetInnerHTML|\\beval\\(|new Function\\(" src || true', { encoding: 'utf8' }).trim();
    expect(hits).toBe('');
  });

  it('همهٔ کوئری‌های SQLite پارامتری‌اند (بدون درج مقدار در متن SQL)', () => {
    const files = ['storage/sqlite/domain.ts', 'storage/sqlite/db.ts', 'storage/sqlite/fullBackup.ts'].map(src).join('\n');
    // تنها درج‌های مجاز: placeholders «?,?,?» در IN (...)، و نام جدول/ستون فقط از راه ident()/identList() که نام را اعتبارسنجی می‌کند
    const interpolated = (files.match(/(prepare|run|exec)\(\s*`[^`]*\$\{[^`]*`/g) ?? [])
      .filter((q) => [...q.matchAll(/\$\{([^}]*)\}/g)].some((m) => !/^(placeholders|ident\(.*\)|identList\(.*\)|qmarks\(.*\))$/.test(m[1])));
    expect(interpolated).toEqual([]);
  });

  it('توکن/کلید مخفی (مثل توکن ربات تلگرام) در کد نیست', () => {
    const hits = execSync('grep -rnE "[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY" src index.html capacitor.config.ts scripts || true', { encoding: 'utf8' }).trim();
    expect(hits).toBe('');
  });
});

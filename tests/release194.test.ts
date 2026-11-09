/**
 * ۱.۹.۴ — مسدودکنندهٔ ثبت قبض فقط یک میان‌بر «رفتن به مدیر ساختمان» دارد.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newBillBlockers } from '../src/logic/billGate';
import { HELP_TOPICS } from '../src/content/help';

describe('۱.۹.۴ میان‌بر مسدودکننده', () => {
  it('App فقط دکمهٔ رفتن به مدیر ساختمان را می‌گذارد و مدیر جدید ندارد', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const block = app.slice(app.indexOf('if (blockers.length)'), app.indexOf('setDraft(emptyDraft'));
    expect(block).toContain("label: 'رفتن به «مدیر ساختمان»'");
    expect(block).toContain("tab: 'manager'");
    expect(block).not.toContain("label: 'مدیر جدید'");
    expect(block).not.toContain('openNewManager');
    expect(block).not.toMatch(/setMgmtEnabled/);
  });

  it('پیام مسدودکننده به دکمهٔ مفرد اشاره می‌کند', () => {
    const errs = newBillBlockers({ mgmtEnabled: true, periods: [], todayKey: '1405-08-19' });
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain('برای این تاریخ مدیر فعالی ثبت نشده است');
    expect(errs[0].message).toContain('دکمهٔ زیر');
    expect(errs[0].message).not.toContain('دکمه‌های زیر');
  });

  it('آموزش دیگر دو میان‌بر یا میان‌بر «مدیر جدید» در این دیالوگ را نمی‌گوید', () => {
    const texts = HELP_TOPICS.flatMap((t) => [
      t.intro,
      ...t.steps,
      ...(t.tips ?? []),
      ...(t.qa ?? []).flatMap((x) => [x.q, x.a]),
    ]).join('\n');
    expect(texts).not.toMatch(/دو دکمهٔ میان‌بر برای رفتن به «مدیر ساختمان» و «مدیر جدید»/);
    expect(texts).not.toMatch(/دو میان‌بر به «مدیر ساختمان» و «مدیر جدید»/);
    expect(texts).not.toMatch(/به «مدیر ساختمان» یا «مدیر جدید» بروید/);
    // خودِ ویژگی مدیر جدید در دوره‌ها باید بماند
    expect(texts).toContain('مدیر جدید');
  });
});

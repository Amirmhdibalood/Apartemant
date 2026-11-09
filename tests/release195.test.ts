/**
 * ۱.۹.۵ — متن مسدودکنندهٔ ثبت قبض (به‌روز در ۱.۹.۶).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newBillBlockers } from '../src/logic/billGate';
import { HELP_TOPICS } from '../src/content/help';

describe('۱.۹.۵ متن مسدودکننده', () => {
  it('پیام billGate مسیر مدیریت ساختمان را می‌گوید', () => {
    const errs = newBillBlockers({ mgmtEnabled: true, periods: [], todayKey: '1405-08-19' });
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain('مدیر فعالی ثبت نشده است');
    expect(errs[0].message).toContain('مدیریت ساختمان');
  });

  it('App همچنان فقط میان‌بر رفتن به مدیریت ساختمان را دارد', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const block = app.slice(app.indexOf('if (blockers.length)'), app.indexOf('setDraft(emptyDraft'));
    expect(block).toContain("label: 'رفتن به «مدیریت ساختمان»'");
    expect(block).not.toContain("label: 'مدیر جدید'");
  });

  it('آموزش هم‌معنا با پیام مسدودکننده است', () => {
    const texts = HELP_TOPICS.flatMap((t) => [
      t.intro,
      ...t.steps,
      ...(t.tips ?? []),
      ...(t.qa ?? []).flatMap((x) => [x.q, x.a]),
    ]).join('\n');
    expect(texts).toContain('به بخش «مدیریت ساختمان» در «دوره‌ها» بروید و مدیر جدید انتخاب کنید');
    expect(texts).not.toMatch(/دوره مالی/);
  });
});

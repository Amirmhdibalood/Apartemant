/**
 * ۱.۹.۵ — متن مسدودکنندهٔ ثبت قبض: بروید به مدیر ساختمان و مدیر جدید انتخاب کنید، یا کلید را خاموش کنید.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newBillBlockers } from '../src/logic/billGate';
import { HELP_TOPICS } from '../src/content/help';

describe('۱.۹.۵ متن مسدودکننده', () => {
  it('پیام billGate دقیقاً متن تأییدشده است', () => {
    const errs = newBillBlockers({ mgmtEnabled: true, periods: [], todayKey: '1405-08-19' });
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe(
      'برای این تاریخ مدیر فعالی ثبت نشده است.\nبه «مدیر ساختمان» بروید و مدیر جدید انتخاب کنید، یا کلید «مدیر ساختمان» را خاموش کنید.',
    );
  });

  it('App همچنان فقط میان‌بر رفتن به مدیر ساختمان را دارد', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const block = app.slice(app.indexOf('if (blockers.length)'), app.indexOf('setDraft(emptyDraft'));
    expect(block).toContain("label: 'رفتن به «مدیر ساختمان»'");
    expect(block).not.toContain("label: 'مدیر جدید'");
  });

  it('آموزش هم‌معنا با پیام مسدودکننده است', () => {
    const texts = HELP_TOPICS.flatMap((t) => [
      t.intro,
      ...t.steps,
      ...(t.tips ?? []),
      ...(t.qa ?? []).flatMap((x) => [x.q, x.a]),
    ]).join('\n');
    expect(texts).toContain('به «مدیر ساختمان» بروید و مدیر جدید انتخاب کنید');
    expect(texts).not.toMatch(/دوره مالی/);
  });
});

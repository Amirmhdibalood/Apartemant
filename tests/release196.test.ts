/**
 * ۱.۹.۶ — نام بخش «مدیریت ساختمان» + متن مسدودکنندهٔ جدید.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newBillBlockers } from '../src/logic/billGate';
import { HELP_TOPICS } from '../src/content/help';

describe('۱.۹.۶ مدیریت ساختمان', () => {
  it('پیام مسدودکننده دقیقاً متن تأییدشده است', () => {
    const errs = newBillBlockers({ mgmtEnabled: true, periods: [], todayKey: '1405-08-19' });
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe(
      'در حال حاضر مدیر فعالی ثبت نشده است.\nبه بخش «مدیریت ساختمان» در «دوره‌ها» بروید و مدیر جدید انتخاب کنید، یا کلید «مدیریت ساختمان» را خاموش کنید.',
    );
  });

  it('UI بخش را مدیریت ساختمان می‌نامد و شخص را مدیر نگه می‌دارد', () => {
    const periods = readFileSync('src/screens/PeriodsScreen.tsx', 'utf8');
    expect(periods).toContain('>مدیریت ساختمان</button>');
    expect(periods).toContain('مدیریت ساختمان در این ساختمان');
    expect(periods).toContain('مدیریت ساختمان روشن شد.');
    expect(periods).toContain('مدیر جدید');
    expect(periods).toContain('مدیر فعال');
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain("label: 'رفتن به «مدیریت ساختمان»'");
    const details = readFileSync('src/screens/BillDetailsScreen.tsx', 'utf8');
    expect(details).toContain('مدیر ساختمان:');
  });

  it('موضوع آموزش management عنوان مدیریت ساختمان دارد', () => {
    const t = HELP_TOPICS.find((x) => x.id === 'management')!;
    expect(t.title).toBe('مدیریت ساختمان');
    expect(t.open?.label).toContain('مدیریت ساختمان');
  });
});

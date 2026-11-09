/**
 * ۱.۹.۳b — دیالوگ portal، پیام کوتاه مسدودکننده، بدون autoFocus.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newBillBlockers } from '../src/logic/billGate';

describe('۱.۹.۳b دیالوگ و مسدودکننده', () => {
  it('Dialog به document.body پورتال می‌شود', () => {
    const src = readFileSync('src/components/Dialog.tsx', 'utf8');
    expect(src).toContain('createPortal');
    expect(src).toContain('document.body');
  });

  it('ErrorDialog روی «متوجه شدم» autoFocus ندارد', () => {
    const src = readFileSync('src/components/ErrorDialog.tsx', 'utf8');
    expect(src).not.toMatch(/متوجه شدم[^<]*autoFocus|autoFocus[^>]*>متوجه شدم/);
    expect(src).toContain('متوجه شدم');
    expect(src).not.toContain('autoFocus');
  });

  it('پیام مسدودکننده کوتاه است و کلید مدیر را عوض نمی‌کند', () => {
    const errs = newBillBlockers({ mgmtEnabled: true, periods: [], todayKey: '1405-08-19' });
    expect(errs).toHaveLength(1);
    expect(errs[0].message.length).toBeLessThan(120);
    expect(errs[0].message).toContain('برای این تاریخ مدیر فعالی ثبت نشده است');
    const app = readFileSync('src/App.tsx', 'utf8');
    const block = app.slice(app.indexOf('if (blockers.length)'), app.indexOf('setDraft(emptyDraft'));
    expect(block).not.toMatch(/setMgmtEnabled/);
    expect(block).toContain("tab: 'manager'");
  });
});

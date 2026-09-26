import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  groupDigits,
  normalizeDigits,
  parseAmount,
  reformatAmountInput,
  sanitizePersonCount,
} from '../src/logic/formatting';

describe('amount formatting / parsing', () => {
  it('formats with thousands separators and English digits', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(999)).toBe('999');
    expect(formatAmount(1000)).toBe('1,000');
    expect(formatAmount(12_500_000)).toBe('12,500,000');
    expect(formatAmount(1_234_567_890_123)).toBe('1,234,567,890,123');
    expect(groupDigits('100000')).toBe('100,000');
  });

  it('parses formatted text, Persian and Arabic digits', () => {
    expect(parseAmount('12,500,000')).toBe(12_500_000);
    expect(parseAmount('۱۲,۵۰۰,۰۰۰')).toBe(12_500_000);
    expect(parseAmount('١٢٥٠٠')).toBe(12_500);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('99999999999999999999')).toBeNull(); // beyond safe integer
  });

  it('normalizes Persian/Arabic digits', () => {
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('واحد ۳')).toBe('واحد 3');
  });

  it('typing 12500000 keystroke by keystroke keeps every digit (no single-digit bug)', () => {
    let display = '';
    let caret = 0;
    let digits = '';
    for (const ch of '12500000') {
      const raw = display.slice(0, caret) + ch + display.slice(caret);
      const r = reformatAmountInput(raw, caret + 1);
      display = r.display;
      caret = r.caret;
      digits = r.digits;
    }
    expect(digits).toBe('12500000');
    expect(display).toBe('12,500,000');
    expect(caret).toBe(display.length);
  });

  it('typing Persian digits keystroke by keystroke', () => {
    let display = '';
    let caret = 0;
    for (const ch of '۱۲۵۰۰۰۰۰') {
      const r = reformatAmountInput(display.slice(0, caret) + ch + display.slice(caret), caret + 1);
      display = r.display;
      caret = r.caret;
    }
    expect(display).toBe('12,500,000');
  });

  it('keeps caret position when inserting in the middle', () => {
    // "1,000" -> insert "5" after "1" => "15,000" caret after "5"
    const r = reformatAmountInput('15,000', 2);
    expect(r.display).toBe('15,000');
    expect(r.caret).toBe(2);
    // "12,500" insert 9 at the end of "12" portion -> "129,500"? raw "129,500" caret 3
    const r2 = reformatAmountInput('129,500', 3);
    expect(r2.display).toBe('129,500');
    expect(r2.caret).toBe(3);
  });

  it('strips leading zeros and non-digits', () => {
    expect(reformatAmountInput('000', 3).display).toBe('0');
    expect(reformatAmountInput('0012', 4).display).toBe('12');
    expect(reformatAmountInput('1a2b3', 5).display).toBe('123');
  });

  it('sanitizes person count input', () => {
    expect(sanitizePersonCount('۳')).toBe('3');
    expect(sanitizePersonCount('04')).toBe('4');
    expect(sanitizePersonCount('2a')).toBe('2');
    expect(sanitizePersonCount('-1')).toBe('1');
    expect(sanitizePersonCount('123456')).toBe('1234');
  });
});

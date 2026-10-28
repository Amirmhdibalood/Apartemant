import { describe, expect, it } from 'vitest';
import { digitsOnly, smsHref, telHref } from '../src/logic/contactActions';
import { sanitizePhone } from '../src/logic/building';

describe('تماس و پیامک', () => {
  it('tel و sms URI', () => {
    expect(telHref('0912-123-4567')).toBe('tel:09121234567');
    expect(smsHref(['09121111111', '09122222222'], 'سلام')).toContain('sms:09121111111,09122222222');
    expect(smsHref(['09121111111'], 'a b')).toContain('body=a%20b');
    expect(digitsOnly('+98 912')).toBe('98912');
  });
  it('sanitizePhone', () => {
    expect(sanitizePhone('0912 345 6789')).toBe('09123456789');
    expect(sanitizePhone('12')).toBeNull();
    expect(sanitizePhone(null)).toBeNull();
  });
});

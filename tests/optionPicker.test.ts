import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OptionPicker } from '../src/components/OptionPicker';
import { SelectField } from '../src/components/SelectField';

const opts = [{ value: 1, label: 'فروردین' }, { value: 2, label: 'اردیبهشت' }, { value: 1405, label: '1405' }];

describe('OptionPicker (ظاهر مشترک با «سال‌های فعال»)', () => {
  it('همان کلاس‌های YearPicker را دوباره استفاده می‌کند', () => {
    const html = renderToStaticMarkup(createElement(OptionPicker, { id: 'm', label: 'ماه', value: 2, options: opts, onChange: () => {} }));
    expect(html).toContain('year-picker__toggle');
    expect(html).toContain('year-picker__label');
    expect(html).toContain('year-picker__value');
    expect(html).toContain('year-picker__chevron');
    expect(html).toContain('اردیبهشت');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<select');
  });
  it('ارقام را فارسی نشان می‌دهد و گزینه نامعتبر را «—» نشان می‌دهد', () => {
    const a = renderToStaticMarkup(createElement(OptionPicker, { id: 'y', label: 'سال', value: 1405, options: opts, onChange: () => {} }));
    expect(a).toContain('۱۴۰۵');
    const b = renderToStaticMarkup(createElement(OptionPicker, { id: 'y', label: 'سال', value: 7, options: opts, onChange: () => {} }));
    expect(b).toContain('—');
  });
  it('SelectField دیگر <select> بومی نمی‌سازد', () => {
    const html = renderToStaticMarkup(createElement(SelectField, { id: 's', label: 'نوع', value: 1, options: opts, onChange: () => {} }));
    expect(html).not.toContain('<select');
    expect(html).toContain('year-picker');
  });
});

describe('جای‌نگهدار اسم مستعار در تنظیمات ساختمان', () => {
  it('مثال «آقای رضایی» ندارد و از الگوی «واحد N» پیروی می‌کند', () => {
    const src = readFileSync(new URL('../src/components/BuildingSection.tsx', import.meta.url), 'utf8');
    expect(src).not.toContain('مثل: آقای رضایی');
    expect(src).toContain('placeholder={unitLabel(i + 1)}');
  });
});

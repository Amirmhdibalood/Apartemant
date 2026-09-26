import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'resources/android/res');
const DENSITIES: Record<string, number> = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** ابعاد PNG از هدر IHDR */
function pngSize(file: string): [number, number] {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('برندینگ آپارتمانت (طرح ۱)', () => {
  it('نام برنامه در تنظیمات Capacitor «آپارتمانت» است و شناسه بسته تغییر نکرده', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf8');
    expect(cfg).toContain("appName: 'آپارتمانت'");
    expect(cfg).toContain("appId: 'ir.buildingcharge.app'");
  });

  it('آیکون‌های لانچر برای همه تراکم‌ها با ابعاد درست موجودند', () => {
    for (const [d, s] of Object.entries(DENSITIES)) {
      const dir = path.join(RES, `mipmap-${d}`);
      for (const n of ['ic_launcher_foreground', 'ic_launcher_background', 'ic_launcher_monochrome']) {
        expect(pngSize(path.join(dir, `${n}.png`))).toEqual([108 * s, 108 * s]);
      }
      for (const n of ['ic_launcher', 'ic_launcher_round']) {
        expect(pngSize(path.join(dir, `${n}.png`))).toEqual([48 * s, 48 * s]);
      }
    }
  });

  it('آیکون تطبیقی (adaptive) به لایه‌های پیش‌زمینه/پس‌زمینه/تک‌رنگ ارجاع می‌دهد', () => {
    for (const n of ['ic_launcher', 'ic_launcher_round']) {
      const x = fs.readFileSync(path.join(RES, `mipmap-anydpi-v26/${n}.xml`), 'utf8');
      expect(x).toContain('@mipmap/ic_launcher_background');
      expect(x).toContain('@mipmap/ic_launcher_foreground');
      expect(x).toContain('@mipmap/ic_launcher_monochrome');
    }
  });

  it('تصاویر اسپلش عمودی و افقی برای همه تراکم‌ها موجودند', () => {
    for (const d of Object.keys(DENSITIES)) {
      const [pw, ph] = pngSize(path.join(RES, `drawable-port-${d}/splash.png`));
      const [lw, lh] = pngSize(path.join(RES, `drawable-land-${d}/splash.png`));
      expect(ph).toBeGreaterThan(pw);
      expect(lw).toBeGreaterThan(lh);
    }
    expect(fs.existsSync(path.join(RES, 'drawable/splash.png'))).toBe(true);
  });
});

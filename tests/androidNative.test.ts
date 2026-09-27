import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const JAVA = 'resources/android/java/ir/buildingcharge/app';

describe('اندروید: نوار پایین بدون فاصله اضافه (edge-to-edge) — نسخه ۱.۴.۰', () => {
  it('صفحه viewport-fit=cover دارد و Capacitor فاصله‌ها را به CSS می‌دهد', () => {
    expect(read('index.html')).toMatch(/viewport-fit=cover/);
    const cfg = read('capacitor.config.ts');
    expect(cfg).toMatch(/insetsHandling:\s*'css'/);
  });

  it('MainActivity پنجره را در همه نسخه‌ها edge-to-edge می‌کند (پس از super.onCreate) و افزونه گالری را قبل از آن ثبت می‌کند', () => {
    const j = read(`${JAVA}/MainActivity.java`);
    expect(j).toContain('package ir.buildingcharge.app;');
    expect(j).toContain('extends BridgeActivity');
    const reg = j.indexOf('registerPlugin(GallerySaverPlugin.class)');
    const sup = j.indexOf('super.onCreate(savedInstanceState)');
    const e2e = j.indexOf('EdgeToEdge.enable(');
    expect(reg).toBeGreaterThan(0);
    expect(reg).toBeLessThan(sup);
    expect(e2e).toBeGreaterThan(sup);
    // آیکون‌های تیره روی پس‌زمینه روشن برنامه
    expect(j).toContain('SystemBarStyle.light(Color.TRANSPARENT');
  });

  it('CSS فقط یک بار فاصله نوار سیستم را اضافه می‌کند (نوار پایین)', () => {
    const css = read('src/styles/global.css');
    expect(css).toMatch(/--safe-bottom:\s*var\(--safe-area-inset-bottom,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
    const nav = css.match(/\.bottom-nav\s*\{[^}]*\}/)?.[0] ?? '';
    expect(nav).toContain('height: calc(var(--nav-h) + var(--safe-bottom))');
    expect(nav).toContain('padding-bottom: var(--safe-bottom)');
    expect(nav).not.toMatch(/margin-bottom/);
  });

  it('افزونه GallerySaver با MediaStore در Pictures ذخیره می‌کند و فقط اندروید ۱۰+ (بدون مجوز)', () => {
    const j = read(`${JAVA}/GallerySaverPlugin.java`);
    expect(j).toContain('@CapacitorPlugin(name = "GallerySaver")');
    expect(j).toContain('MediaStore.Images.Media.RELATIVE_PATH');
    expect(j).toContain('Environment.DIRECTORY_PICTURES');
    expect(j).toContain('IS_PENDING');
    expect(j).toContain('Build.VERSION_CODES.Q');
    expect(j).toContain('"UNSUPPORTED"');
  });

  it('هیچ مجوز حافظه/اینترنت اضافه نمی‌شود', () => {
    const all = [read(`${JAVA}/MainActivity.java`), read(`${JAVA}/GallerySaverPlugin.java`), read('scripts/apply-android-branding.mjs')].join('\n');
    expect(all).not.toMatch(/WRITE_EXTERNAL_STORAGE|READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE|uses-permission android:name="android\.permission\.INTERNET" \/>/);
  });

  it('اسکریپت برندینگ کدهای بومی را در پروژه اندروید کپی می‌کند', () => {
    const s = read('scripts/apply-android-branding.mjs');
    expect(s).toContain("resources/android/java");
    expect(s).toContain("android/app/src/main/java");
  });
});

/**
 * اعمال برندینگ «آپارتمانت» روی پروژه اندروید تولیدشده توسط Capacitor.
 * - کپی آیکون‌ها (adaptive + round + legacy) و تصاویر اسپلش از resources/android/res
 * - تنظیم نام برنامه (app_name) در strings.xml
 * - تنظیم اسپلش Android 12+ (SplashScreen API) در styles.xml
 * - کپی کدهای بومی (resources/android/java → android/app/src/main/java): MainActivity (edge-to-edge) و افزونه‌های GallerySaver و ReportPrint
 * - تنظیم versionName / versionCode در android/app/build.gradle از package.json
 *   (version → versionName، versionCode → versionCode؛ برای انتشار نسخه جدید فقط package.json را تغییر دهید)
 *
 * به‌صورت خودکار بعد از `npx cap add android` / `npx cap sync` / `npx cap copy` اجرا می‌شود
 * (هوک capacitor:copy:after در package.json). اجرای دستی: node scripts/apply-android-branding.mjs
 * بدون وابستگی خارجی و قابل اجرای مکرر (idempotent).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripNetworkPermissions } from './manifest-permissions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_NAME = 'آپارتمانت';
const platform = process.env.CAPACITOR_PLATFORM_NAME;
if (platform && platform !== 'android') process.exit(0);

const RES_DST = path.join(ROOT, 'android/app/src/main/res');
const RES_SRC = path.join(ROOT, 'resources/android/res');
if (!fs.existsSync(RES_DST)) {
  console.log('[branding] android/ not found — skipped (run `npx cap add android` first).');
  process.exit(0);
}

// 1) copy resources
let copied = 0;
(function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else { fs.copyFileSync(s, d); copied++; }
  }
})(RES_SRC, RES_DST);

// 2) launcher label
const stringsPath = path.join(RES_DST, 'values/strings.xml');
if (fs.existsSync(stringsPath)) {
  let x = fs.readFileSync(stringsPath, 'utf8');
  for (const key of ['app_name', 'title_activity_main']) {
    x = x.replace(new RegExp(`(<string name="${key}">)[^<]*(</string>)`), `$1${APP_NAME}$2`);
  }
  fs.writeFileSync(stringsPath, x, 'utf8');
}

// 3) Android 12+ splash (system SplashScreen API): sky-blue background + adaptive launcher icon
const stylesPath = path.join(RES_DST, 'values/styles.xml');
if (fs.existsSync(stylesPath)) {
  let x = fs.readFileSync(stylesPath, 'utf8');
  const items = [
    ['windowSplashScreenBackground', '@color/splash_background'],
    ['windowSplashScreenAnimatedIcon', '@mipmap/ic_launcher'],
  ];
  x = x.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)([\s\S]*?)(<\/style>)/, (m, open, body, close) => {
    for (const [k, v] of items) {
      const re = new RegExp(`\\s*<item name="${k}">[^<]*</item>`);
      body = body.replace(re, '');
      body = body.replace(/\s*$/, '') + `\n        <item name="${k}">${v}</item>`;
    }
    return `${open}${body}\n    ${close}`;
  });
  fs.writeFileSync(stylesPath, x, 'utf8');
}
// 4) version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const versionName = String(pkg.version ?? '');
const versionCode = Number(pkg.versionCode);
if (!/^\d+\.\d+\.\d+$/.test(versionName)) throw new Error(`[branding] invalid package.json version: ${versionName}`);
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
  throw new Error(`[branding] package.json "versionCode" must be a positive integer (got ${pkg.versionCode})`);
}
const gradlePath = path.join(ROOT, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  let g = fs.readFileSync(gradlePath, 'utf8');
  if (!/versionCode\s+\d+/.test(g) || !/versionName\s+"[^"]*"/.test(g)) throw new Error('[branding] versionCode/versionName not found in build.gradle');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  fs.writeFileSync(gradlePath, g, 'utf8');
}

// 5) بدون مجوز اینترنت (برنامه کاملاً آفلاین است)
const manifestPath = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  const m = fs.readFileSync(manifestPath, 'utf8');
  fs.writeFileSync(manifestPath, stripNetworkPermissions(m), 'utf8');
  console.log('[branding] AndroidManifest: INTERNET permission removed (tools:node="remove").');
}

// 6) کدهای بومی برنامه (MainActivity با edge-to-edge در همه نسخه‌های اندروید + افزونه GallerySaver برای «ذخیره در گالری»)
const JAVA_SRC = path.join(ROOT, 'resources/android/java');
const JAVA_DST = path.join(ROOT, 'android/app/src/main/java');
let javaCopied = 0;
if (fs.existsSync(JAVA_SRC) && fs.existsSync(JAVA_DST)) {
  (function copyJava(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) copyJava(s, d);
      else { fs.copyFileSync(s, d); javaCopied++; }
    }
  })(JAVA_SRC, JAVA_DST);
  console.log(`[branding] native sources: ${javaCopied} Java files (MainActivity edge-to-edge, GallerySaver + ReportPrint plugins).`);
}

console.log(`[branding] version ${versionName} (versionCode ${versionCode})`);
console.log(`[branding] applied: ${copied} resource files, label «${APP_NAME}», Android 12+ splash.`);

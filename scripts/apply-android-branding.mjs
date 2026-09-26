/**
 * اعمال برندینگ «آپارتمانت» روی پروژه اندروید تولیدشده توسط Capacitor.
 * - کپی آیکون‌ها (adaptive + round + legacy) و تصاویر اسپلش از resources/android/res
 * - تنظیم نام برنامه (app_name) در strings.xml
 * - تنظیم اسپلش Android 12+ (SplashScreen API) در styles.xml
 *
 * به‌صورت خودکار بعد از `npx cap add android` / `npx cap sync` / `npx cap copy` اجرا می‌شود
 * (هوک capacitor:copy:after در package.json). اجرای دستی: node scripts/apply-android-branding.mjs
 * بدون وابستگی خارجی و قابل اجرای مکرر (idempotent).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
console.log(`[branding] applied: ${copied} resource files, label «${APP_NAME}», Android 12+ splash.`);

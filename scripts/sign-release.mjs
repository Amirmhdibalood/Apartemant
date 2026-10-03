/**
 * امضای APK نسخه Release «آپارتمانت» با zipalign + apksigner (طرح‌های امضای v1 + v2 + v3).
 *
 * پیش‌نیاز: ساخت APK امضانشده با  cd android && gradlew assembleRelease
 * اطلاعات کلید فقط از متغیرهای محیطی خوانده می‌شود (هیچ رمزی در مخزن ذخیره نمی‌شود):
 *   ANDROID_KEYSTORE_PATH      مسیر فایل keystore (.jks)
 *   ANDROID_KEYSTORE_PASSWORD  رمز keystore
 *   ANDROID_KEY_ALIAS          نام کلید (alias)
 *   ANDROID_KEY_PASSWORD       رمز کلید (اختیاری؛ PKCS12 = همان رمز keystore، پیش‌فرض)
 * مسیر SDK از ANDROID_HOME / ANDROID_SDK_ROOT / android/local.properties / مسیر پیش‌فرض ویندوز پیدا می‌شود.
 *
 * اجرا:  node scripts/sign-release.mjs [--in <unsigned.apk>] [--out <signed.apk>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : def;
};
const IN = arg('--in', path.join(ROOT, 'android/app/build/outputs/apk/release/app-release-unsigned.apk'));
const OUT = arg('--out', path.join(ROOT, 'android/app/build/outputs/apk/release/apartemant-release.apk'));

function fail(msg) {
  console.error(`\n[sign-release] ${msg}`);
  process.exit(1);
}

const { ANDROID_KEYSTORE_PATH: KS, ANDROID_KEYSTORE_PASSWORD: KS_PASS, ANDROID_KEY_ALIAS: ALIAS } = process.env;
if (!KS || !KS_PASS || !ALIAS) fail('ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_ALIAS must be set.');
if (!fs.existsSync(KS)) fail(`keystore not found: ${KS}`);
if (!fs.existsSync(IN)) fail(`unsigned APK not found: ${IN}\nRun: cd android && gradlew assembleRelease`);
if (!process.env.ANDROID_KEY_PASSWORD) process.env.ANDROID_KEY_PASSWORD = KS_PASS;

function sdkDir() {
  const cands = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  const lp = path.join(ROOT, 'android/local.properties');
  if (fs.existsSync(lp)) {
    const m = fs.readFileSync(lp, 'utf8').match(/^sdk\.dir=(.*)$/m);
    if (m) cands.push(m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':'));
  }
  if (WIN && process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
  cands.push(path.join(os.homedir(), 'Android', 'Sdk'), path.join(os.homedir(), 'Library', 'Android', 'sdk'));
  return cands.find((d) => d && fs.existsSync(path.join(d, 'build-tools')));
}
const SDK = sdkDir();
if (!SDK) fail('Android SDK not found (set ANDROID_HOME).');
const verNum = (v) => v.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
const cmpVer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 4; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
const btVer = fs.readdirSync(path.join(SDK, 'build-tools'))
  .filter((v) => fs.existsSync(path.join(SDK, 'build-tools', v, WIN ? 'apksigner.bat' : 'apksigner')))
  .sort(cmpVer).pop();
if (!btVer) fail('no build-tools with apksigner found in the Android SDK.');
const BT = path.join(SDK, 'build-tools', btVer);
const ZIPALIGN = path.join(BT, WIN ? 'zipalign.exe' : 'zipalign');
const APKSIGNER = path.join(BT, WIN ? 'apksigner.bat' : 'apksigner');

function run(cmd, args) {
  const q = (s) => (WIN && /[\s"&()^]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const r = WIN
    ? spawnSync(q(cmd), args.map(q), { stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) fail(`command failed: ${path.basename(cmd)} ${args.filter((a) => !a.startsWith('env:')).join(' ')}`);
}

console.log(`[sign-release] build-tools ${btVer}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const aligned = OUT.replace(/\.apk$/i, '') + '-aligned.tmp.apk';
run(ZIPALIGN, ['-f', '-p', '4', IN, aligned]);
run(APKSIGNER, [
  'sign',
  '--ks', KS,
  '--ks-key-alias', ALIAS,
  '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD',
  '--key-pass', 'env:ANDROID_KEY_PASSWORD',
  '--v1-signing-enabled', 'true',
  '--v2-signing-enabled', 'true',
  '--v3-signing-enabled', 'true',
  '--out', OUT,
  aligned,
]);
fs.rmSync(aligned, { force: true });
fs.rmSync(OUT + '.idsig', { force: true });
run(ZIPALIGN, ['-c', '-p', '4', OUT]);
// --min-sdk-version 23 => v1 (JAR) امضا هم بررسی می‌شود (برای minSdk 24 به‌طور پیش‌فرض بررسی نمی‌شود)
run(APKSIGNER, ['verify', '--verbose', '--min-sdk-version', '23', OUT]);
console.log(`\n[sign-release] signed APK: ${OUT}`);

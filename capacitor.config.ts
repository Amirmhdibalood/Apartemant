import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.buildingcharge.app',
  appName: 'آپارتمانت',
  webDir: 'dist',
  android: {
    // بدون نیاز به اینترنت؛ همه فایل‌ها داخل APK هستند
    allowMixedContent: false,
  },
  plugins: {
    // اسپلش بومی: Android 12+ از SplashScreen API (رنگ آسمان + آیکون) و نسخه‌های قدیمی‌تر از تصویر splash استفاده می‌کنند.
    // صفحه ورود داخل برنامه (IntroScreen) به محض بارگذاری آن را پنهان می‌کند؛ launchShowDuration فقط سقف احتیاطی است.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: '#DCE8FF',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
    },
  },
};

export default config;

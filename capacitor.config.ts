import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.buildingcharge.app',
  appName: 'شارژ ساختمان',
  webDir: 'dist',
  android: {
    // بدون نیاز به اینترنت؛ همه فایل‌ها داخل APK هستند
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
    },
  },
};

export default config;

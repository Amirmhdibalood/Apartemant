import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// base: './' => مسیرهای نسبی تا داخل WebView اندروید (Capacitor) درست بارگذاری شود
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    // نسخه برنامه از package.json (همان versionName اندروید)
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: { host: true },
});

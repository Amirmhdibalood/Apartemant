import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' => مسیرهای نسبی تا داخل WebView اندروید (Capacitor) درست بارگذاری شود
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: { host: true },
});

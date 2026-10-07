/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vercel from './vercel.json';

// Production headers live in vercel.json; `vite preview` serves the same set so
// the CSP is exercised locally before it ships.
const productionHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: productionHeaders },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});

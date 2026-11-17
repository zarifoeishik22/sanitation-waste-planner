// The app's source is in app/. The build is written to the repository root (index.html and assets/),
// because GitHub Pages serves this repository from the root of main.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react()],
  build: { outDir: '..', emptyOutDir: false, assetsDir: 'assets', chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { map: ['maplibre-gl'], charts: ['recharts'] } } } },
  server: { fs: { allow: ['..'] } },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js (dynamically imported only by 3D eksperymenty, patrz
    // core/three/useThreeLoop.ts) tworzy własny, świadomie duży, LENIWY
    // chunk (~688 kB) — ładowany dopiero przy wejściu do laboratoriów 3D.
    // UWAGA (audyt): główny chunk `index` to ~858 kB, bo `labs/index.ts`
    // importuje statycznie wszystkie 13 laboratoriów (świadomy wybór na
    // rzecz gwarancji offline PWA — patrz komentarz niżej). Produktowy
    // użytkownik (Asystent/Porównaj/Kampanie) i tak pobiera cały ten chunk;
    // rozbicie per-trasa to główny dług wydajnościowy do rozważenia.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // React/react-dom change far less often than app code — a separate
        // vendor chunk means a Genesis OS release doesn't invalidate the
        // browser's cached React bundle (and vice versa). No route-based
        // lazy-loading here on purpose: the lab registry is synchronous
        // (labs/index.ts), which the offline PWA cache and sims.test.ts
        // both depend on — splitting further risks the verified offline
        // guarantee for a marginal gain.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-dom/client'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});

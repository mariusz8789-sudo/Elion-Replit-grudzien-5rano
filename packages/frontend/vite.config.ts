import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js (dynamically imported only by 3D eksperymenty, patrz
    // core/three/useThreeLoop.ts) tworzy własny, świadomie duży, LENIWY
    // chunk — podnosimy próg ostrzeżenia zamiast go sztucznie dzielić;
    // główny bundle (index+vendor) pozostaje ~187 kB niezależnie od tego.
    chunkSizeWarningLimit: 750,
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

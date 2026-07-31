import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy in dev so the browser makes same-origin requests and generated
    // PDFs resolve from a relative /documents path in both dev and production.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/documents': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});

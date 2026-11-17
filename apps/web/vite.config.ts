import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // In dev, /api is proxied to the API so the browser sees one origin
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true } },
  },
});

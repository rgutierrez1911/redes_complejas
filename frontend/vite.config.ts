import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// https://vite.dev/config/
export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});

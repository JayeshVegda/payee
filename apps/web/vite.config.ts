import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: '127.0.0.1',
    port: 4782,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4783',
        changeOrigin: false
      }
    }
  }
});

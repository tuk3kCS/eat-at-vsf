import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '');
  const proxy = { '/api': { target: env.API_PROXY_URL ?? 'http://127.0.0.1:' + (env.PORT ?? 3001) } };
  return { plugins: [react(), tailwind()], server: { proxy }, preview: { proxy } };
});

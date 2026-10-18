import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In local dev the /api functions (Vercel serverless) are not running, so we
// proxy /api to a deployed backend. Override with VITE_API_PROXY in .env.local.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target =
    env.VITE_API_PROXY || 'https://radio-thomas-charlesandres-projects.vercel.app';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  };
});

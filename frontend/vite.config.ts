import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path'

dotenv.config({ path: '../.env' }); // Adjust path as needed

export default defineConfig(({ mode }) => {

  const env = loadEnv(mode, process.cwd());
  const API_URL = `${env.VITE_FULL_API_URL ?? 'http://localhost:8080'}`;
  const PORT = `${env.VITE_API_PORT ?? '3010'}`;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
});

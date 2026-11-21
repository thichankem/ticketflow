import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).replace(/\\/g, '/');

export default defineConfig({
  root: __dirname,
  plugins: [
    {
      name: 'sync-chunk-versions',
      enforce: 'post',
      transform(code, id) {
        if (id.includes('.vite/deps')) {
          let hash = 'unified';
          try {
            const metaPath = path.resolve(__dirname, 'node_modules/.vite/deps/_metadata.json');
            if (fs.existsSync(metaPath)) {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              hash = meta.browserHash || 'unified';
            }
          } catch {}

          const regex = /((\bfrom\b|\bimport\b)\s+["'][^"']*?\/chunk-[^"']+?\.js)(?:(?:\?v=[a-zA-Z0-9_-]+)?)(["'])/g;
          const transformed = code.replace(regex, (m, p1, p2, p3) => p1 + '?v=' + hash + p3);
          return { code: transformed, map: null };
        }
      },
    },
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@supabase/supabase-js',
      'dompurify',
      'qrcode',
      'html5-qrcode',
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        credentials: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        credentials: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist').replace(/\\/g, '/'),
    emptyOutDir: true,
    sourcemap: false,
  },
});

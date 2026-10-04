import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'waypoint-offline-shell',
      apply: 'build',
      generateBundle(_options, bundle) {
        const fingerprint = createHash('sha256')
          .update(Object.keys(bundle).sort().join('|'))
          .digest('hex')
          .slice(0, 12);
        const worker = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8');
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: worker.replace('waypoint-shell-v1', `waypoint-shell-${fingerprint}`).replace(
            'const PRECACHE = [];',
            `const PRECACHE = ${JSON.stringify(
              Object.keys(bundle)
                .filter((name) => name.startsWith('assets/') && /\.(js|css)$/.test(name))
                .map((name) => '/' + name),
            )};`,
          ),
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});

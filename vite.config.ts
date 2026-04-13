import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env': {},
    global: 'globalThis',
  },
  plugins: [
    nodePolyfills({ include: ['buffer', 'process'], globals: { Buffer: true, process: true } }),
    wasm(),
    react(),
    viteCommonjs(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      '@midnight-ntwrk/compact-js': fileURLToPath(new URL('node_modules/@midnight-ntwrk/compact-js', import.meta.url)),
      '@midnight-ntwrk/compact-runtime': fileURLToPath(new URL('node_modules/@midnight-ntwrk/compact-runtime', import.meta.url)),
    },
  },
  optimizeDeps: {
    esbuildOptions: { define: { global: 'globalThis' } },
    exclude: ['@midnight-ntwrk/onchain-runtime-v2'],
  },
  build: {
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        deploy: fileURLToPath(new URL('deploy.html', import.meta.url)),
      },
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
});

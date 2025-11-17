import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icon.svg'],
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'FuchsPOS',
        short_name: 'FuchsPOS',
        description: 'Point of Sale Progressive Web App für moderne Kassenerlebnisse',
        start_url: '.',
        display: 'standalone',
        theme_color: '#0ea5e9',
        background_color: '#020617',
        icons: [
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', includeAssets: ['favicon.svg'], manifest: { name: 'Smart Wildlife Conservation System', short_name: 'WildlifeGuard', start_url: '/', display: 'standalone', theme_color: '#12372A', background_color: '#F5F7F2', icons: [{ src: '/pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' }, { src: '/pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' }] } })],
  server: { port: 5173 }
});

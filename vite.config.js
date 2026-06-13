import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // In dev, the Vite server doesn't host uploaded images / bill PDFs — proxy
  // those paths to the Node backend so images don't render broken locally.
  server: {
    proxy: {
      '/uploads': 'http://localhost:5000',
      '/bills': 'http://localhost:5000',
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      cleanupOutdatedCaches: true,
      devOptions: { enabled: false }, // don't cache in dev — avoids stale SW blank pages
      // Server-rendered routes (feedback page, bill PDFs, uploads, API) must NOT
      // be answered by the SPA navigate-fallback — otherwise customers opening the
      // SMS feedback link or a bill PDF get the cached app shell (landing page).
      workbox: {
        cleanupOutdatedCaches: true,
        // Activate a freshly deployed worker immediately and take control of
        // already-open pages, so installed apps stop using a stale worker that
        // hijacks public links (e.g. the SMS feedback link) into the app shell.
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/f\//,          // feedback short link  /f/<token>
          /^\/feedback/,     // /feedback, /feedback.html, /feedback/<token>
          /^\/api\//,        // backend API
          /^\/bills\//,      // generated bill PDFs
          /^\/uploads\//,    // uploaded images/files
        ],
      },
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Networking Experts – Service Portal',
        short_name: 'Nest',
        description: 'Manage tickets, services, and network infrastructure.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});


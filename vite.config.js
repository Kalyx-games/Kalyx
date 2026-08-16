import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Configuration de Vite (l'outil qui assemble le site).
// - react() : permet d'écrire l'interface avec React
// - VitePWA : rend le site installable comme une app (manifest + service worker)
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // L'app installée se mettra à jour toute seule à chaque déploiement
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch.png'],
      manifest: {
        id: '/?v=2',
        name: 'Kalyx — Jeux de société',
        short_name: 'Kalyx',
        description: 'Catalogue de jeux de société partagé',
        lang: 'fr',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#f4f5f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Fichiers mis en cache par le service worker (l'app marche hors ligne)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
})

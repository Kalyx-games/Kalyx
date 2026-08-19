import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Identifiant de version injecté à la COMPILATION (date + hash de commit court) → affiché dans les
// Réglages pour vérifier d'un coup d'œil si la PWA installée est bien à jour. Sur Vercel, le hash vient
// de la variable d'env du déploiement ; en local, de git.
const buildVersion = (() => {
  let hash = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
  if (!hash) {
    try {
      hash = execSync('git rev-parse --short HEAD').toString().trim()
    } catch {
      hash = 'dev'
    }
  }
  // ⚠️ Heure de PARIS, pas celle du serveur de build : Vercel compile en UTC, et une version
  // annoncée « 11h18 » qui s'affichait « 09h19 » dans l'app donnait l'impression de ne pas l'avoir.
  const horodatage = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(':', 'h') // « 19/08 11:22 » → « 19/08 11h22 »
  return `${horodatage} · ${hash}`
})()

// Configuration de Vite (l'outil qui assemble le site).
// - react() : permet d'écrire l'interface avec React
// - VitePWA : rend le site installable comme une app (manifest + service worker)
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(buildVersion) },
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

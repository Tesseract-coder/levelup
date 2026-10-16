import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-64.png', 'reminders-sw.js'],
      manifest: {
        name: 'LevelUp — Fitness, Habits & Nutrition',
        short_name: 'LevelUp',
        description: 'Track workouts, habits, sleep and food in one place, with honest goal-based feedback.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7fb',
        theme_color: '#4f46e5',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Log food', short_name: 'Food', url: '/?quick=food', icons: [{ src: '/icons/shortcut-food.png', sizes: '96x96' }] },
          { name: 'Log workout', short_name: 'Workout', url: '/?quick=workout', icons: [{ src: '/icons/shortcut-workout.png', sizes: '96x96' }] },
          { name: 'Log water', short_name: 'Water', url: '/?quick=water', icons: [{ src: '/icons/shortcut-water.png', sizes: '96x96' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        globIgnores: ['**/*cyrillic*', '**/*vietnamese*', '**/*greek*', '**/shortcut-*'],
        navigateFallback: '/index.html',
        importScripts: ['/reminders-sw.js'],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: true },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['dexie', '@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
});

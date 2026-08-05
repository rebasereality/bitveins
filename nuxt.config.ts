// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'
import { reportActionableBuildWarning } from './build/build-warning-policy'

export default defineNuxtConfig({
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@vite-pwa/nuxt', '@nuxt/eslint'],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Bitveins',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      meta: [
        { name: 'theme-color', content: '#1b1e23' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Bitveins' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'application-name', content: 'Bitveins' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/bitveins-hand-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/icons/bitveins-hand-16x16.png' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/bitveins-hand-180x180.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'system',
    classSuffix: '',
  },
  runtimeConfig: {
    session: {
      cookie: {
        secure: true,
      },
      maxAge: 60 * 60 * 24 * 365,
    },
  },
  compatibilityDate: '2025-07-15',
  nitro: {
    experimental: {
      websocket: true,
    },
  },
  vite: {
    build: {
      rollupOptions: {
        onwarn: reportActionableBuildWarning,
      },
    },
    server: {
      allowedHosts: ['localhost', '127.0.0.1'],
    },
    plugins: [tailwindcss()],
  },
  hooks: {
    'vite:extendConfig'(config) {
      Object.assign(config, {
        build: {
          ...config.build,
          rollupOptions: {
            ...config.build?.rollupOptions,
            onwarn: reportActionableBuildWarning,
          },
        },
      })
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
  pwa: {
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    srcDir: '../service-worker',
    strategies: 'injectManifest',
    manifest: {
      id: '/',
      name: 'Bitveins Async Terminal',
      short_name: 'Bitveins',
      description: 'Async tmux terminal control for high-latency mobile links.',
      theme_color: '#1b1e23',
      background_color: '#1b1e23',
      display: 'standalone',
      display_override: ['standalone', 'fullscreen'],
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      categories: ['productivity', 'utilities', 'developer'],
      icons: [
        {
          src: '/icons/bitveins-hand-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/bitveins-hand-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/bitveins-hand-maskable-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/bitveins-hand-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
    },
  },
})

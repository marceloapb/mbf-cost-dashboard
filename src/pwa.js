'use strict';

/**
 * Recursos do PWA (Progressive Web App) servidos pela própria Lambda:
 * manifest, service worker e ícone. Permite "instalar" o painel como app
 * e é a base do wrapper Android.
 */

const { FAVICON_SVG } = require('./brand');

// Ícone do app: reaproveita o logo "B" laranja (SVG). Chrome aceita SVG no manifest.
const ICON_SVG = FAVICON_SVG;

const MANIFEST = {
  name: 'MBF Monitor',
  short_name: 'MBF',
  description: 'Painel de custos AWS e leitor de e-mails com IA',
  start_url: '.',
  scope: '.',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0f1115',
  theme_color: '#0f1115',
  icons: [
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
  ],
};

// Service worker mínimo: network-first, com fallback simples offline.
const SERVICE_WORKER = `
const CACHE = 'mbf-monitor-v1';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then(function (res) {
        try {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        } catch (_) {}
        return res;
      })
      .catch(function () { return caches.match(req); })
  );
});
`;

// Tag para o <head> das páginas: registra manifest, theme e service worker.
const PWA_HEAD_TAGS =
  '<link rel="manifest" href="manifest.webmanifest">' +
  '<meta name="theme-color" content="#0f1115">' +
  '<meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
  '<script>if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){});});}</script>';

module.exports = { MANIFEST, SERVICE_WORKER, ICON_SVG, PWA_HEAD_TAGS };

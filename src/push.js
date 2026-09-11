'use strict';

/**
 * Notificações push no PWA (Web Push via Firebase Cloud Messaging).
 *
 * Este módulo gera 3 artefatos servidos pela própria Lambda:
 *   1) A CONFIG do cliente (lida das env vars) → exposta em GET /push-config.
 *   2) O service worker do Firebase Messaging → GET /firebase-messaging-sw.js.
 *   3) Um trecho de JS injetado nas páginas logadas que pede permissão,
 *      obtém o token FCM e registra em POST /api/push/register.
 *
 * IMPORTANTE (Opção B — placeholders): as credenciais NÃO ficam no repositório.
 * São lidas de variáveis de ambiente (definidas no template.yaml / deploy):
 *   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *   FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID, FIREBASE_VAPID_KEY
 * Todas essas são credenciais de CLIENTE (públicas por design no front-end).
 * Enquanto não forem preenchidas, o push fica desativado silenciosamente.
 */

// Versão do SDK compat do Firebase usada no navegador/SW (via CDN gstatic).
const FIREBASE_SDK_VERSION = '10.12.2';

/**
 * Monta a config pública do Firebase a partir das env vars.
 * @returns {{configured:boolean, firebaseConfig?:object, vapidKey?:string}}
 */
function getPushConfig() {
  const apiKey = process.env.FIREBASE_API_KEY || '';
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const senderId = process.env.FIREBASE_MESSAGING_SENDER_ID || '';
  const appId = process.env.FIREBASE_APP_ID || '';
  const vapidKey = process.env.FIREBASE_VAPID_KEY || '';
  // Precisa do mínimo para funcionar; senão, push desligado.
  if (!apiKey || !projectId || !senderId || !appId || !vapidKey) {
    return { configured: false };
  }
  return {
    configured: true,
    firebaseConfig: {
      apiKey,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      messagingSenderId: senderId,
      appId,
    },
    vapidKey,
  };
}

/**
 * Service worker do Firebase Messaging (background). Precisa se chamar
 * exatamente "firebase-messaging-sw.js" e viver na raiz do escopo.
 * Ele lê a config de /push-config e trata push em segundo plano + clique.
 */
const MESSAGING_SW = `/* MBF Monitor — Firebase Messaging SW */
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js');

// Busca a config pública e inicializa o Messaging para receber push em background.
fetch('push-config')
  .then(function (r) { return r.json(); })
  .then(function (cfg) {
    if (!cfg || !cfg.configured) return; // push desativado (sem credenciais)
    firebase.initializeApp(cfg.firebaseConfig);
    var messaging = firebase.messaging();
    messaging.onBackgroundMessage(function (payload) {
      var n = (payload && payload.notification) || {};
      var d = (payload && payload.data) || {};
      var title = n.title || d.title || 'Novo e-mail da AWS';
      var body = n.body || d.body || '';
      self.registration.showNotification(title, {
        body: body,
        icon: 'icon.svg',
        badge: 'icon.svg',
        tag: d.tipo || 'mbf-email',
        data: { url: 'emails' },
      });
    });
  })
  .catch(function () { /* falha suave: sem push */ });

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || 'emails';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(target) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
`;

/**
 * JS injetado nas páginas logadas: registra o SW do messaging, e expõe
 * window.mbfEnablePush() para pedir permissão (precisa de gesto do usuário)
 * e registrar o token no backend. Não faz nada se push não estiver configurado.
 */
const PUSH_CLIENT_SCRIPT = `
<script src="https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js"></script>
<script>
(function () {
  window.mbfPush = window.mbfPush || {};
  var cfgPromise = null;
  function loadCfg() {
    if (!cfgPromise) {
      cfgPromise = fetch('push-config', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .catch(function () { return { configured: false }; });
    }
    return cfgPromise;
  }
  // Suporte básico do navegador para Web Push.
  window.mbfPush.supported = ('serviceWorker' in navigator) && ('Notification' in window) && ('PushManager' in window);

  // Estado atual (para a UI decidir o rótulo do botão).
  window.mbfPush.status = function () {
    if (!window.mbfPush.supported) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  };

  // Registra o SW do Firebase Messaging (idempotente).
  function registerSW() {
    return navigator.serviceWorker.register('firebase-messaging-sw.js');
  }

  // Obtém o token FCM e envia ao backend. Requer permissão já concedida.
  function fetchAndRegisterToken(cfg, swReg) {
    if (typeof firebase === 'undefined' || !firebase.messaging) throw new Error('SDK do Firebase não carregou');
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(cfg.firebaseConfig);
    var messaging = firebase.messaging();
    // Notificação em primeiro plano: mostra também quando a aba está aberta.
    messaging.onMessage(function (payload) {
      var n = (payload && payload.notification) || {};
      try {
        if (swReg && swReg.showNotification) {
          swReg.showNotification(n.title || 'Novo e-mail da AWS', { body: n.body || '', icon: 'icon.svg', tag: 'mbf-email' });
        }
      } catch (e) {}
    });
    return messaging.getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: swReg }).then(function (token) {
      if (!token) throw new Error('sem token');
      return fetch('api/push/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'token=' + encodeURIComponent(token),
      }).then(function () { return token; });
    });
  }

  // Chamado por um clique do usuário: pede permissão e registra o token.
  window.mbfPush.enable = function () {
    return loadCfg().then(function (cfg) {
      if (!cfg || !cfg.configured) throw new Error('Notificações ainda não configuradas no servidor.');
      if (!window.mbfPush.supported) throw new Error('Este navegador não suporta notificações push.');
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') throw new Error('Permissão de notificação negada.');
        return registerSW().then(function (swReg) { return fetchAndRegisterToken(cfg, swReg); });
      });
    });
  };

  // Ao carregar: se a permissão JÁ foi concedida antes, revalida o token silenciosamente
  // (o token FCM pode mudar; isso mantém o backend atualizado).
  window.addEventListener('load', function () {
    loadCfg().then(function (cfg) {
      if (!cfg || !cfg.configured || !window.mbfPush.supported) return;
      if (Notification.permission === 'granted') {
        registerSW().then(function (swReg) { return fetchAndRegisterToken(cfg, swReg); }).catch(function () {});
      }
    });
  });
})();
</script>`;

module.exports = { getPushConfig, MESSAGING_SW, PUSH_CLIENT_SCRIPT, FIREBASE_SDK_VERSION };

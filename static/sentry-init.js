// sentry-init.js — Inicialización de Sentry en el browser.
//
// Lee el DSN del frontend desde un <meta name="sentry-dsn"> que el backend
// renderiza con la variable de entorno SENTRY_DSN_FRONTEND. Si el meta tag
// está vacío (entorno local sin DSN configurado, o fork sin tracking),
// Sentry no se inicializa y la app sigue funcionando normalmente.

(function() {
  if (typeof Sentry === 'undefined') return;

  var meta = document.querySelector('meta[name="sentry-dsn"]');
  var dsn = meta ? (meta.getAttribute('content') || '').trim() : '';
  if (!dsn) return;

  Sentry.init({
    dsn: dsn,
    sendDefaultPii: true,
    tracesSampleRate: 0.1,
    // Reduce ruido: ignora errores comunes de extensiones / bots
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  });
})();

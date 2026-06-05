/* Service worker do PWA "Minhas Finanças".
 * Responsável por: ciclo de vida (ativação imediata) e recebimento de Web Push.
 * Mantido deliberadamente simples — sem cache de navegação para não interferir
 * em rotas autenticadas/Server Components.
 */

/* Assume controle assim que instalado, sem esperar abas antigas fecharem. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

/* Toma controle das abas já abertas no escopo. */
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* Recebe push do backend (VAPID) e exibe uma notificação.
 * Payload esperado (JSON): { title, body, url, icon?, badge?, tag? }.
 * Tolerante a payloads ausentes ou em texto puro.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || "Minhas Finanças";
  const url = payload.url || "/";

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon.svg",
    badge: payload.badge || "/icon.svg",
    tag: payload.tag || undefined,
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Ao clicar na notificação, foca uma aba já aberta na URL alvo ou abre uma nova. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          const wanted = new URL(targetUrl, self.location.origin);
          if (clientUrl.pathname === wanted.pathname && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

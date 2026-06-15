// MAAT — Service Worker
// Push notifications + offline shell
// Registrado desde maat_dashboard.html via navigator.serviceWorker.register('./sw.js')

const CACHE_NAME = "maat-v2";
const APP_SHELL = ["./", "./manifest.json"];

// Install — pre-cache app shell (sin bloquear si falla algun recurso)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — shell offline-first, resto stale-while-revalidate (solo same-origin GET)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Documento principal: red primero (contenido fresco), cache como respaldo offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  // Recursos propios (manifest, iconos locales): stale-while-revalidate.
  if (req.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Push notification received
self.addEventListener("push", (event) => {
  let data = { title: "MAAT", body: "Tienes una notificación", view: "calib" };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/logo_app.png",
    badge: "/logo_app.png",
    vibrate: [100, 50, 100],
    data: { view: data.view || "calib" },
    actions: [{ action: "open", title: "Abrir MAAT" }],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click — open app or focus existing tab
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const view = event.notification.data?.view || "calib";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If app is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes("maat") && "focus" in client) {
          client.focus();
          client.postMessage({ type: "NAVIGATE", view });
          return;
        }
      }
      // Otherwise open a new window at the SW scope (works on any deploy path)
      if (self.clients.openWindow) {
        return self.clients.openWindow(self.registration.scope);
      }
    })
  );
});

// Message from main app
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

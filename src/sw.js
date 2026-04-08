// MAAT — Service Worker
// Push notifications + offline awareness
// Registrado desde maat_dashboard.html via navigator.serviceWorker.register('/sw.js')

const CACHE_NAME = "maat-v1";

// Install — pre-cache minimal shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
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
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
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

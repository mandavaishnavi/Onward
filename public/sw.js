// Service worker: keeps the app opening offline and shows reminders that
// arrive as push messages, including the Done / Snooze buttons on them.
const CACHE = "onward-v14";
const SHELL = ["/", "/app.css", "/app.js", "/shared.js", "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Fresh from the network when online (so updates show up at once); the saved copy is the offline fallback.
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname === "/act") return;
  const key = req.mode === "navigate" ? "/" : req;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then((hit) => hit || Response.error())));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (err) { d = { t: "Onward", b: e.data ? e.data.text() : "" }; }
  const opts = {
    body: d.b || "", tag: d.tag || "onward", renotify: true, icon: "/icon-192.png", badge: "/badge.png",
    data: { id: d.id || "", tok: d.tok || "", alarm: !!d.alarm },
    actions: d.tok ? [{ action: "done", title: "Done" }, { action: "snooze", title: "Snooze 10 min" }] : [],
  };
  if (d.alarm) {
    // An "alarm" stays on screen until you deal with it and buzzes for much longer.
    opts.requireInteraction = true;
    opts.vibrate = [600, 200, 600, 200, 600, 200, 600, 200, 1200, 300, 1200];
  }
  e.waitUntil(self.registration.showNotification(d.t || "Onward", opts));
});

self.addEventListener("notificationclick", (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  if ((e.action === "done" || e.action === "snooze") && d.tok) {
    e.waitUntil(fetch("/act?j=1&a=" + e.action + "&t=" + encodeURIComponent(d.tok), { method: "POST" })
      .then((r) => r.json()).catch(() => null)
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((list) => list.forEach((c) => c.postMessage({ sync: 1 }))));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) { c.postMessage({ open: d.id, alarm: d.alarm }); return c.focus(); }
    }
    return self.clients.openWindow("/?open=" + encodeURIComponent(d.id) + (d.alarm ? "&alarm=1" : ""));
  }));
});

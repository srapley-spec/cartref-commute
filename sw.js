// Service worker for time-to-leave and wake-up alerts (docs/stories/time-to-leave-alerts.md).
// It only shows notifications the proxy sends and opens the app when one is tapped. It has no fetch handler and
// caches nothing, so the app always loads exactly as it does without it.
// A notice identical to the one already showing (a repeat from the proxy) replaces it silently: no second buzz.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : "" }; }
  const title = d.title || "Commute", body = d.body || "", tag = d.tag || undefined;
  event.waitUntil((async () => {
    let same = false;
    try { same = !!tag && (await self.registration.getNotifications({ tag })).some((n) => n.title === title && n.body === body); } catch (e) { /* show it */ }
    await self.registration.showNotification(title, { body, tag, renotify: !!tag && !same, icon: "icon-192.png", data: { url: "./" } });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if ("focus" in w) return w.focus();
    return self.clients.openWindow("./");
  }));
});

// Imported by the generated service worker (see vite.config.ts workbox.importScripts).
//
// Why this exists: the app's HTML is built on the server for every visit. The
// runtime "html-nav" cache only holds a copy of the start page once the user
// has opened the app while the service worker was already in control. A user
// who installs the app and then goes offline before opening it again has no
// copy at all, so the phone shows its own "You're offline" page and the app
// never gets to run its saved contacts and saved location.
//
// To guarantee a copy exists, fetch the start page during service worker
// install (always online at that moment) and store it in the same cache the
// navigation strategy reads from.

const HTML_NAV_CACHE = "html-nav";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(new Request("/", { cache: "reload" }));
        if (!response || !response.ok) return;
        const cache = await caches.open(HTML_NAV_CACHE);
        await cache.put(new Request("/"), response.clone());
      } catch {
        // Offline or blocked during install: the runtime cache still fills in
        // on the next online visit.
      }
    })(),
  );
});

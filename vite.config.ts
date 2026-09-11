// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";

// Emit a tiny offline shell HTML that loads the client entry chunk. Workbox
// precaches this shell and serves it as the navigation fallback when the device
// is offline, so the installed PWA opens straight to the main screen instead
// of the browser's default offline splash.
function offlineShellPlugin(): Plugin {
  return {
    name: "offline-shell",
    apply: "build",
    generateBundle(_options, bundle) {
      const entryChunk = Object.values(bundle).find(
        (chunk) =>
          chunk.type === "chunk" && (chunk as OutputChunk).isEntry && chunk.name === "index"
      ) as OutputChunk | undefined;
      if (!entryChunk) return;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta name="theme-color" content="#000000">
  <title>ZC FIRE E-CONNECT</title>
  <link rel="icon" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;background:#0F172A;color:#F8FAFC;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
    #root{min-height:100dvh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;text-align:center}
    #root img{width:80px;height:80px;border-radius:18px;object-fit:cover}
    #root p{margin:0;font-size:15px;line-height:1.4;opacity:.9}
  </style>
</head>
<body>
  <div id="root">
    <img src="/icon-192.png" alt="ZC FIRE E-CONNECT">
    <p>Loading ZC FIRE E-CONNECT…</p>
  </div>
  <script type="module" src="/${entryChunk.fileName}"></script>
</body>
</html>`;

      this.emitFile({
        type: "asset",
        fileName: "offline-shell.html",
        source: html,
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      offlineShellPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        // The client bundle is emitted to dist/client and served from the site
        // root, so the SW + precache manifest must be generated from there.
        outDir: "dist/client",
        // public/manifest.webmanifest is hand-maintained; letting the plugin
        // emit its own produced two conflicting precache entries for the same
        // URL, which made the whole service worker fail to evaluate.
        manifest: false,
        workbox: {
          globDirectory: "dist/client",
          // The offline shell is generated into dist/client by the plugin above.
          // Workbox precaches it and returns it for navigation requests that
          // cannot be served from the network or runtime cache.
          navigateFallback: "offline-shell.html",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          // Emit a single self-contained sw.js; the split AMD runtime chunk
          // registers its install listener too late and skips precaching.
          inlineWorkboxRuntime: true,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-nav",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: ({ url }) =>
                url.origin === self.location.origin &&
                /\.(?:js|css|woff2?|png|svg|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/_serverFn/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "server-fn",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  },
});

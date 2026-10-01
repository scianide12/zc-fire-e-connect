// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
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
          globPatterns: ["**/*.{js,css,ico,png,svg,webmanifest}"],
          globIgnores: ["sw-offline-shell.js"],
          // Caches the real start page HTML at install time so an offline
          // launch opens the app itself instead of the browser offline page.
          importScripts: ["/sw-offline-shell.js"],
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
                // The server-rendered HTML can carry Vary headers; ignore them
                // so the install-time copy always matches an offline launch.
                matchOptions: { ignoreVary: true },
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

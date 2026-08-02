import type { Workbox } from "workbox-window";

// Set once the guarded registration succeeds, so a manual "Check for updates"
// can reuse the same Workbox instance instead of registering a second time.
let activeWb: Workbox | null = null;
let pendingApply: (() => void) | null = null;

// Guarded service worker registration.
// - Never registers in dev, iframe, or Lovable preview hosts.
// - Supports ?sw=off kill switch.
export async function registerServiceWorker(
  onUpdateReady?: (applyUpdate: () => void) => void,
) {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const url = new URL(window.location.href);
  const inIframe = window.self !== window.top;
  const isPreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  const killed = url.searchParams.get("sw") === "off";

  if (!import.meta.env.PROD || inIframe || isPreview || killed) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        if (r.active?.scriptURL.endsWith("/sw.js")) await r.unregister();
      }
    } catch {}
    return;
  }

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox("/sw.js");

    const notify = () => {
      if (!onUpdateReady) return;
      onUpdateReady(() => {
        // Reload once the new worker has taken control.
        wb.addEventListener("controlling", () => window.location.reload());
        wb.messageSkipWaiting();
      });
    };

    // Fires when a new SW is installed and waiting behind the active one.
    wb.addEventListener("waiting", notify);

    await wb.register();
  } catch (e) {
    console.warn("SW registration failed", e);
  }
}

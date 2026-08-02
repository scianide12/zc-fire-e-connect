import type { Workbox } from "workbox-window";

// Set once the guarded registration succeeds, so a manual "Check for updates"
// can reuse the same Workbox instance instead of registering a second time.
let activeWb: Workbox | null = null;
let pendingApply: (() => void) | null = null;
const getPendingApply = () => pendingApply;

// Background update checks are throttled: at most one per hour per device,
// remembered across launches so reopening the app doesn't re-check every time.
const MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const LAST_CHECK_KEY = "r9_last_update_check";
let lastCheckAt = 0;

function readLastCheck(): number {
  if (lastCheckAt) return lastCheckAt;
  try {
    const raw = window.localStorage.getItem(LAST_CHECK_KEY);
    lastCheckAt = raw ? Number(raw) || 0 : 0;
  } catch {
    lastCheckAt = 0;
  }
  return lastCheckAt;
}

function markChecked() {
  lastCheckAt = Date.now();
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, String(lastCheckAt));
  } catch {}
}

function shouldCheckNow() {
  return Date.now() - readLastCheck() >= MIN_CHECK_INTERVAL_MS;
}

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
    activeWb = wb;

    const apply = () => {
      // Reload once the new worker has taken control.
      wb.addEventListener("controlling", () => window.location.reload());
      wb.messageSkipWaiting();
    };

    const notify = () => {
      pendingApply = apply;
      onUpdateReady?.(apply);
    };

    // Fires when a new SW is installed and waiting behind the active one.
    wb.addEventListener("waiting", notify);

    await wb.register();

    // Ask the browser for a newer build on app open and when the app returns
    // to the foreground — but never more often than MIN_CHECK_INTERVAL_MS.
    const silentCheck = () => {
      if (!shouldCheckNow()) return;
      markChecked();
      wb.update().catch(() => {});
    };
    silentCheck();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") silentCheck();
    });
  } catch (e) {
    console.warn("SW registration failed", e);
  }
}

export type UpdateCheckResult = "updating" | "up-to-date" | "unavailable";

/**
 * Manually ask the browser for a newer build. Resolves to "updating" when a
 * new version was found and is being applied (the page reloads on its own).
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (typeof window === "undefined") return "unavailable";
  if (!activeWb) return "unavailable";

  // A downloaded update is already waiting — just apply it.
  if (pendingApply) {
    pendingApply();
    return "updating";
  }

  const found = new Promise<boolean>((resolve) => {
    const onWaiting = () => resolve(true);
    activeWb!.addEventListener("waiting", onWaiting);
    // Give the browser time to fetch and install a new worker.
    setTimeout(() => resolve(false), 8000);
  });

  try {
    await activeWb.update();
  } catch {
    return "unavailable";
  }

  if (!(await found)) return "up-to-date";
  getPendingApply()?.();
  return "updating";
}

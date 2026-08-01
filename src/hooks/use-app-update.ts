import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker and, when a newer build has finished
 * downloading, shows a persistent toast letting the user apply it.
 * Never auto-reloads — an emergency app must not interrupt the user.
 */
export function useAppUpdate() {
  useEffect(() => {
    let cancelled = false;

    import("../lib/register-sw").then((m) =>
      m.registerServiceWorker((applyUpdate) => {
        if (cancelled) return;
        toast("New version available", {
          description: "Refresh to get the latest contacts and fixes.",
          duration: Infinity,
          action: {
            label: "Refresh",
            onClick: () => applyUpdate(),
          },
        });
      }),
    );

    return () => {
      cancelled = true;
    };
  }, []);
}

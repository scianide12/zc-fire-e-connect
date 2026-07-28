import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "r9_install_dismissed_v1";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed / running standalone
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (navigator as any).standalone === true;
    if (standalone) return;

    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    const isSafari = /safari/.test(ua) && !/crios|fxios|chrome|android/.test(ua);
    if (iOS && isSafari) {
      setIsIOS(true);
      setVisible(true);
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm">
      <Download className="mt-0.5 h-5 w-5 flex-shrink-0 text-emergency" />
      <div className="flex-1">
        <div className="font-semibold">Install this app</div>
        {isIOS ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Tap <Share className="inline h-3 w-3 align-text-bottom" /> Share, then
            "Add to Home Screen" for one-tap access — even offline.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Add to your home screen for one-tap access, even offline.
            </p>
            {deferred && (
              <button
                onClick={install}
                className="mt-2 rounded-lg bg-emergency px-3 py-2 text-xs font-semibold text-emergency-foreground"
              >
                Install app
              </button>
            )}
          </>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-md p-1 text-muted-foreground hover:bg-accent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

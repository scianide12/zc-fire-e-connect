import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Share,
  Plus,
  MoreVertical,
  Download,
  Wifi,
  WifiOff,
  CheckCircle2,
  Smartphone,
  Apple,
} from "lucide-react";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Install the App – Region 9 Emergency Contacts" },
      {
        name: "description",
        content:
          "Step-by-step instructions to install Region 9 Emergency Contacts on iPhone and Android for one-tap access, even offline.",
      },
      { property: "og:title", content: "Install the App – Region 9 Emergency Contacts" },
      {
        property: "og:description",
        content: "Add the Zamboanga City emergency contacts app to your home screen — works offline.",
      },
    ],
  }),
  component: InstallPage,
});

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function InstallPage() {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    const android = /android/.test(ua);
    setPlatform(iOS ? "ios" : android ? "android" : "other");

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setInstalled(standalone);

    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  const verifyOffline = async () => {
    // Prime the cache by touching the current page & data, then instruct user.
    try {
      await fetch(window.location.href, { cache: "reload" });
    } catch {}
    alert(
      "Cache primed.\n\nTo verify offline:\n1. Turn on Airplane Mode.\n2. Reopen the installed app from your Home Screen.\n3. The 911 banner and station list should still load.",
    );
  };

  const checkUpdates = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const { checkForAppUpdate } = await import("@/lib/register-sw");
      const result = await checkForAppUpdate();
      if (result === "updating") {
        toast("Update found", { description: "Installing the newest version…" });
        return; // page reloads itself
      }
      if (result === "up-to-date") {
        toast("You're up to date", {
          description: "You already have the newest version.",
        });
      } else {
        toast("Updates unavailable here", {
          description:
            "Open the installed app (or the published site) to check for updates.",
        });
      }
    } finally {
      setChecking(false);
    }
  };


  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-background pb-16 text-foreground">
      <header className="sticky top-0 z-10 bg-emergency px-4 py-4 text-emergency-foreground shadow">
        <Link to="/" className="inline-flex items-center gap-2 text-sm opacity-90">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Install the app</h1>
        <p className="text-sm opacity-90">
          One-tap access on your home screen — works offline once installed.
        </p>
      </header>

      {installed && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emergency" />
          <span>You're already using the installed app. You're all set!</span>
        </div>
      )}

      <div className="mx-4 mt-4 flex gap-2">
        <button
          onClick={() => setPlatform("ios")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            platform === "ios"
              ? "border-emergency bg-emergency text-emergency-foreground"
              : "border-border bg-card"
          }`}
        >
          <Apple className="mr-1 inline h-4 w-4" /> iPhone / iPad
        </button>
        <button
          onClick={() => setPlatform("android")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            platform === "android"
              ? "border-emergency bg-emergency text-emergency-foreground"
              : "border-border bg-card"
          }`}
        >
          <Smartphone className="mr-1 inline h-4 w-4" /> Android
        </button>
      </div>

      {platform !== "android" && (
        <Section title="Install on iPhone / iPad (Safari)">
          <Step n={1} title="Open in Safari">
            Make sure this page is open in <b>Safari</b> — installation doesn't
            work in Chrome or in-app browsers on iOS.
          </Step>
          <Step n={2} title="Tap the Share button">
            Tap <Share className="inline h-4 w-4 align-text-bottom" /> at the
            bottom of the screen (or top on iPad).
          </Step>
          <Step n={3} title='Choose "Add to Home Screen"'>
            Scroll down in the share sheet and tap{" "}
            <Plus className="inline h-4 w-4 align-text-bottom" />{" "}
            <b>Add to Home Screen</b>.
          </Step>
          <Step n={4} title="Confirm">
            Tap <b>Add</b> in the top-right. The red flame icon will appear on
            your home screen.
          </Step>
        </Section>
      )}

      {platform !== "ios" && (
        <Section title="Install on Android (Chrome)">
          {deferred && (
            <button
              onClick={install}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emergency py-3 font-bold text-emergency-foreground"
            >
              <Download className="h-5 w-5" /> Install now (one tap)
            </button>
          )}
          <Step n={1} title="Open in Chrome">
            Best results in <b>Chrome</b> or Edge. Some in-app browsers won't
            show the install option.
          </Step>
          <Step n={2} title="Open the menu">
            Tap <MoreVertical className="inline h-4 w-4 align-text-bottom" />{" "}
            in the top-right corner.
          </Step>
          <Step n={3} title='Tap "Install app" or "Add to Home screen"'>
            Chrome shows <b>Install app</b>; other browsers may say{" "}
            <b>Add to Home screen</b>.
          </Step>
          <Step n={4} title="Confirm">
            Tap <b>Install</b>. The app opens full-screen with the flame icon
            on your home screen.
          </Step>
        </Section>
      )}

      <Section title="Verify offline mode">
        <p className="mb-3 text-sm text-muted-foreground">
          After installing, the app caches the 911 banner, station list, and
          layout so it opens without internet.
        </p>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          {online ? (
            <>
              <Wifi className="h-4 w-4 text-online" />
              <span>You're online right now.</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-offline" />
              <span>You're offline — and this page still loaded. ✅</span>
            </>
          )}
        </div>
        <ol className="ml-5 list-decimal space-y-2 text-sm">
          <li>Install the app using the steps above.</li>
          <li>
            Open it once while online so station data is saved to your device.
          </li>
          <li>
            Turn on <b>Airplane Mode</b> (or disable Wi-Fi and mobile data).
          </li>
          <li>
            Reopen the app from your home screen — the 911 banner and station
            list should appear as normal.
          </li>
        </ol>
        <button
          onClick={verifyOffline}
          className="mt-4 w-full rounded-xl border border-border bg-card py-3 text-sm font-medium"
        >
          Prime cache & show test steps
        </button>
      </Section>

      <footer className="mx-4 mt-8 text-center text-xs text-muted-foreground">
        Region IX
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-4 mt-6 rounded-2xl bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex gap-3 last:mb-0">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emergency text-sm font-bold text-emergency-foreground">
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

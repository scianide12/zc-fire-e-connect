import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Phone, MapPin, Search, AlertTriangle, Flame, Users, RefreshCw, QrCode, Download } from "lucide-react";
import { listStations, syncStations, type Station } from "@/lib/stations.functions";
import { InstallPrompt } from "@/components/InstallPrompt";
import { toast } from "sonner";
import SEED_STATIONS from "@/data/stations-seed.json";

const STATIONS_CACHE_KEY = "r9_stations_v1";
const LOCATION_FRESH_MS = 10 * 60 * 1000;

function readCachedStations(): Station[] | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(STATIONS_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as Station[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

const STATIONS_AT_KEY = "r9_stations_at_v1";
const LAST_SYNC_KEY = "r9_last_sync_v1";
const AUTO_SYNC_MS = 60 * 60 * 1000;

function writeCache(data: Station[]) {
  try {
    localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(STATIONS_AT_KEY, String(Date.now()));
  } catch {}
}

const stationsQuery = queryOptions({
  queryKey: ["stations"],
  // The device cache is the source of truth when there is no connection, so
  // React Query must not retry or pause — the query fn owns the fallback.
  retry: false,
  networkMode: "always",
  staleTime: 5 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
  // Render saved contacts instantly; fresh data loads in the background.
  // Fallback: bundled snapshot so a brand-new install shows contacts at once.
  initialData: () => readCachedStations() ?? (SEED_STATIONS as Station[]),
  initialDataUpdatedAt: () => {
    if (typeof window === "undefined") return 0;
    const v = Number(localStorage.getItem(STATIONS_AT_KEY));
    return v || 0;
  },
  queryFn: async () => {
    // Offline: resolve straight from the device instead of waiting for a
    // server request that cannot succeed.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return readCachedStations() ?? (SEED_STATIONS as Station[]);
    }
    try {
      const data = await listStations();
      if (typeof window !== "undefined" && data.length) writeCache(data);
      return data;
    } catch (e) {
      const cached = readCachedStations();
      if (cached) return cached;
      if (SEED_STATIONS.length) return SEED_STATIONS as Station[];
      throw e;
    }
  },
});



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZC FIRE E-CONNECT" },
      {
        name: "description",
        content:
          "Quick-dial emergency contacts for Zamboanga City fire sub-stations. Call the nearest station in one tap.",
      },
      { name: "theme-color", content: "#000000" },
      { property: "og:title", content: "ZC FIRE E-CONNECT" },
      {
        property: "og:description",
        content: "Quick-dial emergency contacts for Zamboanga City fire sub-stations. Call the nearest station in one tap.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(stationsQuery),
  component: Home,
  errorComponent: ({ reset }) => (
    <div className="p-6 text-center">
      <p className="mb-4">Something went wrong loading stations.</p>
      <button onClick={reset} className="rounded-lg bg-emergency px-4 py-2 text-emergency-foreground">
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

// Zamboanga City landline area code
const PH_AREA_CODE = "62";

function splitRawPhones(phone: string): string[] {
  return phone
    .split(/[/,;]| or /i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Preserve leading +, strip everything else non-digit
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return "";

  if (hasPlus) {
    // already international
    return `+${digits}`;
  }
  // Country code without + (e.g. 639xxxxxxxxx)
  if (digits.startsWith("63") && (digits.length === 12 || digits.length === 11)) {
    return `+${digits}`;
  }
  // Local mobile / national: 09xxxxxxxxx
  if (digits.startsWith("0")) {
    return `+63${digits.slice(1)}`;
  }
  // Bare 7-digit Zamboanga landline
  if (digits.length === 7) {
    return `+63${PH_AREA_CODE}${digits}`;
  }
  // 10-digit national without leading 0
  if (digits.length === 10 && digits.startsWith("9")) {
    return `+63${digits}`;
  }
  // Fallback: return digits with + if it looks international-length
  return digits.length >= 11 ? `+${digits}` : digits;
}

// Alternate contacts are Zamboanga City landlines; display them with the 062
// area code prefix instead of the cellphone-style +63 normalization.
function formatLandline(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // 7-digit Zamboanga landline -> 062-XXXXXXX
  if (digits.length === 7) return `062-${digits}`;
  // Already stored as 062XXXXXXX (10 digits starting with 62)
  if (digits.length === 10 && digits.startsWith("62")) {
    return `062-${digits.slice(2)}`;
  }
  // Other alternate contacts are mobile numbers; display them consistently
  // with primary mobile contacts instead of preserving source spacing.
  return normalizePhone(raw);
}

function telHrefLandline(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 7) return `tel:062${digits}`;
  if (digits.length === 10 && digits.startsWith("62")) return `tel:0${digits}`;
  return `tel:${normalizePhone(raw)}`;
}

const phoneListCache = new Map<string, string>();
function formatPhoneList(phone: string): string {
  const hit = phoneListCache.get(phone);
  if (hit !== undefined) return hit;
  const out = splitRawPhones(phone)
    .map((raw, i) => (i === 0 ? normalizePhone(raw) : formatLandline(raw)))
    .join(" / ");
  phoneListCache.set(phone, out);
  return out;
}


function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type Tab = "fire" | "barangay";
type LocStatus = "idle" | "consent" | "asking" | "granted" | "denied" | "unavailable";
const LOC_PROMPTED_KEY = "r9_loc_prompted";

function Home() {
  const { data: stations } = useSuspenseQuery(stationsQuery);
  const router = useRouter();
  const sync = useServerFn(syncStations);
  const [tab, setTab] = useState<Tab>("fire");
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locAt, setLocAt] = useState<number | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>("idle");
  const [locAccuracy, setLocAccuracy] = useState<number | null>(null);
  const [nearestIdx, setNearestIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);


  const filtered = useMemo(
    () =>
      stations.filter(
        (s) =>
          s.category === tab &&
          s.station_name?.trim() &&
          s.phone_number?.trim() &&
          s.latitude != null &&
          s.longitude != null,
      ),
    [stations, tab],
  );

  const nearestSorted = useMemo(() => {
    if (!userLoc) return filtered;
    return [...filtered]
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        ...s,
        _dist: haversine(userLoc, { lat: s.latitude!, lon: s.longitude! }),
      }))
      .sort((a, b) => (a as any)._dist - (b as any)._dist)
      .slice(0, 10);
  }, [filtered, userLoc]);

  const searchIndex = useMemo(
    () => filtered.map((s) => [s, s.station_name.toLowerCase()] as const),
    [filtered],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return searchIndex.filter(([, name]) => name.includes(q)).map(([s]) => s);
  }, [filtered, searchIndex, search]);

  const userLocRef = useRef<{ lat: number; lon: number } | null>(null);
  userLocRef.current = userLoc;
  const locStatusRef = useRef<LocStatus>("idle");
  locStatusRef.current = locStatus;
  const accuracyRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const retryTappedRef = useRef(false);
  const [showLocHelp, setShowLocHelp] = useState(false);
  // Button tap: drop any dead watch so tracking re-arms, then ask again.
  // Browsers never re-show the permission popup once blocked, so if it is
  // still denied we show how to turn it on in the phone's settings.
  const retryLocation = () => {
    retryTappedRef.current = true;
    setShowLocHelp(false);
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    requestLocation();
  };

  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  // When the user returns from Settings, re-check location automatically.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      if (userLocRef.current) return;
      const s = locStatusRef.current;
      if (s !== "denied" && s !== "unavailable") return;
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      requestLocation();
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptPosition = (pos: GeolocationPosition) => {
    const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const at = pos.timestamp || Date.now();
    const acc = pos.coords.accuracy ?? null;
    const prev = userLocRef.current;

    setLocStatus("granted");

    // Ignore GPS jitter: only take a new fix when we actually moved ~50m or
    // the reading is meaningfully more accurate than what we already have.
    const movedKm = prev ? haversine(prev, next) : Infinity;
    const better = acc != null && accuracyRef.current != null && acc < accuracyRef.current - 20;
    if (prev && movedKm < 0.05 && !better) {
      setLocAt(at);
      return;
    }

    accuracyRef.current = acc;
    setLocAccuracy(acc);
    userLocRef.current = next;
    setUserLoc(next);
    setLocAt(at);
  };

  const handleLocError = (err: GeolocationPositionError) => {
    if (err.code === 1) {
      if (retryTappedRef.current) setShowLocHelp(true);
      setLocStatus("denied");
      return;
    }
    // Signal dropped / timed out: keep whatever position we already have
    // instead of flipping the whole screen into an error state.
    if (userLocRef.current) return;
    // No fix yet but the continuous watch is still running: the phone is
    // just taking longer than the 4s fast check to lock satellites. Stay in
    // "asking" so the "Location off" warning never flashes and disappears.
    if (watchIdRef.current != null) return;
    setLocStatus("unavailable");
  };

  // Instant low-accuracy fix for the first paint, then a continuous watch so a
  // returning signal is picked up within a second or two.
  const requestLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocStatus("unavailable");
      return;
    }
    if (!userLocRef.current) setLocStatus("asking");

    navigator.geolocation.getCurrentPosition(acceptPosition, handleLocError, {
      enableHighAccuracy: false,
      timeout: 1500,
      maximumAge: 10 * 60 * 1000,
    });

    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(acceptPosition, handleLocError, {
      enableHighAccuracy: true,
      timeout: 27000,
      maximumAge: 60000,
    });
  };

  // Keep an offline copy of the station list (the query fn runs on the server
  // during SSR, so the browser must persist it explicitly).
  useEffect(() => {
    if (!stations?.length) return;
    writeCache(stations);
  }, [stations]);

  // Automatic check at most once per hour; the Update button always runs.
  const runSync = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    try {
      const last = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0;
      if (Date.now() - last < AUTO_SYNC_MS) return;
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    } catch {}
    try {
      await sync();
      await router.invalidate();
    } catch (e) {
      console.warn("Background station sync failed", e);
    }
  };

  // On first load: start location tracking + fire background sync (when online)
  useEffect(() => {
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    // Soft prompt: on a first visit, explain why location is needed before
    // the browser's own popup appears (avoids reflexive "Block" taps).
    const prompted = (() => {
      try { return localStorage.getItem(LOC_PROMPTED_KEY) === "1"; } catch { return false; }
    })();
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((s) => {
          if (s.state === "prompt") setLocStatus("consent");
          else requestLocation();
        })
        .catch(() => (prompted ? requestLocation() : setLocStatus("consent")));
    } else if (prompted) {
      requestLocation();
    } else {
      setLocStatus("consent");
    }
    void runSync();

    const goOnline = () => {
      setOffline(false);
      void runSync();
    };
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (watchIdRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zero-latency permission detection: the Permissions API answers the
  // "location off" question instantly instead of waiting out the 4-second GPS
  // timeout, and it fires the moment the user flips the setting while the app
  // is open (without permission support, GPS behaviour is unchanged).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let ps: PermissionStatus | null = null;
    const apply = (state: PermissionState) => {
      // A live GPS fix outranks the permission state — never override it.
      if (userLocRef.current) return;
      if (state === "denied") {
        setLocStatus("denied");
        return;
      }
      // Permission just turned on while the app is open: start tracking.
      if (state === "granted" && locStatusRef.current === "denied") {
        // The dead watch under the denied permission must be re-armed.
        if (watchIdRef.current != null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
        requestLocation();
      }
    };
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        ps = status;
        apply(status.state);
        status.onchange = () => apply(status.state);
      })
      .catch(() => {});
    return () => {
      if (ps) ps.onchange = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const nearest = nearestSorted[nearestIdx];

  const handleRefresh = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOffline(true);
      return;
    }
    setRefreshing(true);
    try {
      const result = await sync({ data: { force: true } });
      await router.invalidate();
      if (result?.skipped) {
        const mins = result.lastSyncedAt
          ? Math.max(0, Math.round((Date.now() - new Date(result.lastSyncedAt).getTime()) / 60000))
          : null;
        toast.message(
          mins !== null && mins > 0
            ? `Already up to date — contacts were checked ${mins} min ago`
            : "Already up to date — contacts were just checked",
        );
      } else {
        toast.success("Contacts updated");
      }
      // Also pull any newer app build; reloads on its own when one is found.
      try {
        const { checkForAppUpdate } = await import("@/lib/register-sw");
        const result = await checkForAppUpdate();
        if (result === "up-to-date") toast.success("You're on the latest version");
      } catch {}
    } finally {
      setRefreshing(false);
    }
  };


  const selected = stations.find((s) => s.id === selectedId);

  // Only a live GPS fix counts — no last-known-location fallback.
  const usableLoc = userLoc != null;
  const locFresh = locAt != null && Date.now() - locAt < LOCATION_FRESH_MS;
  // Coarse tower/Wi-Fi fix (>500m): show the nearest station right away but
  // mark the distance approximate until the precise GPS watch sharpens it.
  const locCoarse = locAccuracy != null && locAccuracy > 500;
  const locFailed = locStatus === "denied" || locStatus === "unavailable";

  const statusMessage = (() => {
    if (offline && !usableLoc && locStatus === "asking") {
      return "Offline — showing saved contacts. Getting your location…";
    }
    if (offline && !usableLoc) {
      return "Offline and location off — showing saved contacts. Turn on location to find the nearest responders.";
    }
    if (offline) {
      return "Offline — showing saved contacts. Call Nearest station active via GPS.";
    }
    if (locFailed && !usableLoc) {
      return "Location off — turn on location to find the nearest responders.";
    }
    return null;
  })();

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-16">
      {/* Emergency banner */}
      <header className="sticky top-0 z-20 border-b border-border bg-background shadow-lg">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> National Emergency Hotline
          </div>
          <a
            href="tel:911"
            className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-emergency px-4 py-4 text-emergency-foreground active:scale-[.98] transition"
          >
            <div>
              <div className="text-4xl font-black tracking-tight">911</div>
              <div className="text-sm opacity-90">Tap to call</div>
            </div>
            <Phone className="h-10 w-10" strokeWidth={2} />
          </a>
        </div>
        <h1 className="px-4 pt-1 pb-6 text-lg font-semibold">ZC FIRE E-CONNECT</h1>
      </header>

      <InstallPrompt />

      {statusMessage ? (
        <div className="mx-4 mt-4 rounded-xl bg-warning p-3 text-sm font-medium text-warning-foreground">
          {statusMessage}
        </div>
      ) : null}


      {/* Location status */}
      {!userLoc && (locStatus === "denied" || locStatus === "unavailable") ? (
        <div className="mx-4 mt-4 rounded-xl border border-border bg-card p-3 text-sm">
          <p className="mb-2">
            {locStatus === "unavailable"
              ? "Couldn't get your location right now (this can happen with no signal). Distances need a location fix."
              : "Location access is needed to find the station nearest to you."}
          </p>
          <button
            onClick={retryLocation}
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
          >
            {locStatus === "unavailable" ? "Try again" : "Enable location"}
          </button>
          {showLocHelp && locStatus === "denied" ? (
            <div className="mt-3 rounded-lg bg-background p-3 text-muted-foreground">
              <p className="mb-2 font-semibold text-foreground">Location is blocked — allow it again:</p>
              {isIOS ? (
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Tap <b>aA</b> in Safari's address bar → <b>Website Settings</b> → Location → <b>Allow</b>.</li>
                  <li>Installed app: Settings → Privacy &amp; Security → Location Services → <b>Safari Websites</b> → <b>While Using</b>.</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Swipe down and make sure <b>Location</b> is ON.</li>
                  <li>Tap the <b>lock/tune icon</b> by the web address → <b>Permissions</b> → Location → <b>Allow</b>. Installed app: long-press its icon → App info → Permissions → Location.</li>
                </ol>
              )}
              <p className="mt-2">Come back here — the app will detect it automatically.</p>
            </div>
          ) : null}
        </div>
      ) : null}


      {/* Category tabs */}
      <nav className="mx-4 mt-4 grid grid-cols-2 gap-2">
        {[
          { id: "fire" as Tab, label: "Fire", Icon: Flame },
          { id: "barangay" as Tab, label: "Barangay", Icon: Users },
        ].map(({ id, label, Icon }) => {
          const count = stations.filter((s) => s.category === id).length;
          const active = tab === id;
          return (
            <button
              key={id}
              aria-pressed={active}
              onClick={() => {
                setTab(id);
                setNearestIdx(0);
                setSelectedId("");
              }}
              className={`flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition active:scale-[.98] ${
                active
                  ? "border-emergency text-emergency shadow-sm"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  active ? "bg-emergency/10" : "bg-background"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[11px] opacity-70">{count} listed</span>
              </span>
            </button>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <div className="mx-4 mt-6 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No {tab} stations available yet. Data is being expanded soon.
        </div>
      ) : (
        <>
          {/* Option 1 — Nearest */}
          <section className="mx-4 mt-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Call nearest station
            </h2>
            {userLoc && nearest ? (
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {(nearest as any)._dist != null
                    ? `${(nearest as any)._dist.toFixed(1)} km away${locCoarse || (usableLoc && !locFresh) ? " · approximate" : ""}`
                    : "Nearest available"}
                </div>

                <div className="mt-1 text-xl font-bold">{nearest.station_name}</div>
                <div className="text-sm text-muted-foreground">{formatPhoneList(nearest.phone_number)}</div>
                {splitRawPhones(nearest.phone_number).map((raw, i, arr) => {
                  const isPrimary = i === 0;
                  const displayNum = isPrimary ? normalizePhone(raw) : formatLandline(raw);
                  const href = isPrimary ? `tel:${normalizePhone(raw)}` : telHrefLandline(raw);
                  return (
                    <a
                      key={`${i}-${displayNum}`}
                      href={href}
                      className="mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-emergency px-3 text-base font-bold text-emergency-foreground active:scale-[.98] transition sm:text-lg"
                    >
                      <Phone className="h-6 w-6 shrink-0" strokeWidth={2} />
                      <span className="truncate">
                        {arr.length > 1 ? `Call ${isPrimary ? "primary" : "alternate"} — ${displayNum}` : "Call now"}
                      </span>
                    </a>
                  );
                })}
                {nearestSorted.length > 1 && (
                  <button
                    onClick={() =>
                      setNearestIdx((i) => (i + 1) % nearestSorted.length)
                    }
                    className="mt-2 flex h-16 w-full items-center justify-center rounded-xl border border-muted-foreground/50 px-3 text-base font-medium"
                  >
                    Try next nearest
                  </button>
                )}
              </div>
            ) : locStatus === "consent" ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-base font-bold">Find the closest responders </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Allow location access so the app can instantly connect you to the nearest responders.
                </p>
                <button
                  onClick={() => {
                    try { localStorage.setItem(LOC_PROMPTED_KEY, "1"); } catch {}
                    retryLocation();
                  }}
                  className="mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-emergency px-3 text-base font-bold text-emergency-foreground active:scale-[.98] transition"
                >
                  <MapPin className="h-6 w-6 shrink-0" strokeWidth={2} />
                  Allow location access
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                {locStatus === "asking"
                  ? "Getting your location…"
                  : "Enable location."}
              </div>
            )}
          </section>

          {/* Option 2 — Select */}
          <section className="mx-4 mt-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Call by selection
            </h2>
            <div className="rounded-2xl bg-card p-4">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stations…"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
              </label>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No matches</div>
                ) : (
                  searchResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`cv-list-item flex w-full items-center justify-between border-b border-border px-3 py-3 text-left last:border-b-0 ${
                        selectedId === s.id ? "bg-accent" : ""
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium">{s.station_name}</div>
                        <div className="text-xs text-muted-foreground">{formatPhoneList(s.phone_number)}</div>
                      </div>
                      {selectedId === s.id && (
                        <span className="text-xs text-emergency">Selected</span>
                      )}
                    </button>
                  ))
                )}
              </div>
              {selected && splitRawPhones(selected.phone_number).map((raw, i, arr) => {
                const isPrimary = i === 0;
                const displayNum = isPrimary ? normalizePhone(raw) : formatLandline(raw);
                const href = isPrimary ? `tel:${normalizePhone(raw)}` : telHrefLandline(raw);
                return (
                  <a
                    key={`${i}-${displayNum}`}
                    href={href}
                    className="mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-emergency px-3 text-base font-bold text-emergency-foreground active:scale-[.98] transition sm:text-lg"
                  >
                    <Phone className="h-6 w-6 shrink-0" strokeWidth={2} />
                    <span className="truncate">
                      {arr.length > 1
                        ? `Call ${isPrimary ? "primary" : "alternate"} — ${displayNum}`
                        : `Call ${selected.station_name}`}
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        </>
      )}

      <footer className="mx-4 mt-8 grid grid-cols-3 items-center text-xs text-muted-foreground">
        <Link to="/install" className="flex items-center justify-center gap-1 text-center">
          <Download className="h-3 w-3 shrink-0" /> Install instructions
        </Link>
        <Link to="/share" className="flex items-center justify-center gap-1 text-center">
          <QrCode className="h-3 w-3 shrink-0" /> Share
        </Link>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center justify-center gap-1 text-center disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Updating" : "Update"}
        </button>
      </footer>

    </div>
  );
}

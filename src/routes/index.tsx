import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Phone, MapPin, Search, AlertTriangle, Flame, Users, RefreshCw, QrCode, Download } from "lucide-react";
import { listStations, syncStations, type Station } from "@/lib/stations.functions";
import { InstallPrompt } from "@/components/InstallPrompt";
import { toast } from "sonner";

const STATIONS_CACHE_KEY = "r9_stations_v1";
const LOCATION_CACHE_KEY = "r9_last_location_v1";
const LOCATION_FRESH_MS = 10 * 60 * 1000;

const stationsQuery = queryOptions({
  queryKey: ["stations"],
  queryFn: async () => {
    try {
      const data = await listStations();
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(data));
        } catch {}
      }
      return data;
    } catch (e) {
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(STATIONS_CACHE_KEY);
        if (cached) return JSON.parse(cached) as Station[];
      }
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

function formatPhoneList(phone: string): string {
  return splitRawPhones(phone)
    .map((raw, i) => (i === 0 ? normalizePhone(raw) : formatLandline(raw)))
    .join(" / ");
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

function Home() {
  const { data: stations } = useSuspenseQuery(stationsQuery);
  const router = useRouter();
  const sync = useServerFn(syncStations);
  const [tab, setTab] = useState<Tab>("fire");
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locAt, setLocAt] = useState<number | null>(null);
  const [locFromCache, setLocFromCache] = useState(false);
  const [locStatus, setLocStatus] = useState<
    "idle" | "asking" | "granted" | "denied" | "unavailable"
  >("idle");
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

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((s) => s.station_name.toLowerCase().includes(q));
  }, [filtered, search]);

  const userLocRef = useRef<{ lat: number; lon: number } | null>(null);
  userLocRef.current = userLoc;
  const accuracyRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  const acceptPosition = (pos: GeolocationPosition) => {
    const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const at = pos.timestamp || Date.now();
    const acc = pos.coords.accuracy ?? null;
    const prev = userLocRef.current;

    setLocStatus("granted");
    setLocFromCache(false);

    // Ignore GPS jitter: only take a new fix when we actually moved ~50m or
    // the reading is meaningfully more accurate than what we already have.
    const movedKm = prev ? haversine(prev, next) : Infinity;
    const better = acc != null && accuracyRef.current != null && acc < accuracyRef.current - 20;
    if (prev && movedKm < 0.05 && !better) {
      setLocAt(at);
      return;
    }

    accuracyRef.current = acc;
    userLocRef.current = next;
    setUserLoc(next);
    setLocAt(at);

    // Throttle persistence so a busy watch doesn't hammer storage.
    if (at - lastWriteRef.current > 30000) {
      lastWriteRef.current = at;
      try {
        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({ ...next, at }));
      } catch {}
    }
  };

  const handleLocError = (err: GeolocationPositionError) => {
    if (err.code === 1) {
      setLocStatus("denied");
      return;
    }
    // Signal dropped / timed out: keep whatever position we already have
    // instead of flipping the whole screen into an error state.
    if (userLocRef.current) return;
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
      timeout: 8000,
      maximumAge: 10 * 60 * 1000,
    });

    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(acceptPosition, handleLocError, {
      enableHighAccuracy: true,
      timeout: 27000,
      maximumAge: 60000,
    });
  };

  // Restore the last known position so distances render instantly, even offline.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCATION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { lat: number; lon: number; at?: number };
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          userLocRef.current = { lat: parsed.lat, lon: parsed.lon };
          setUserLoc({ lat: parsed.lat, lon: parsed.lon });
          setLocAt(parsed.at ?? null);
          setLocFromCache(true);
          setLocStatus("granted");
        }
      }
    } catch {}
  }, []);

  // Keep an offline copy of the station list (the query fn runs on the server
  // during SSR, so the browser must persist it explicitly).
  useEffect(() => {
    if (!stations?.length) return;
    try {
      localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(stations));
    } catch {}
  }, [stations]);

  const runSync = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
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
    requestLocation();
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

  // A usable position means we have any location, even a cached one.
  const usableLoc = userLoc != null;
  const locFresh = locAt != null && Date.now() - locAt < LOCATION_FRESH_MS;
  const locFailed = locStatus === "denied" || locStatus === "unavailable";

  // Banner only when something is genuinely missing; a cached/stale position
  // is still usable, so we label distances as approximate instead.
  const statusMessage = (() => {
    if (offline && locFailed && !usableLoc) {
      return "Offline and no location — showing saved contacts. Distances are unavailable.";
    }
    if (offline && locFailed) {
      return "Offline and no location fix — using your last known location. Distances may be out of date.";
    }
    if (offline) {
      return usableLoc
        ? "Offline — showing saved contacts and using your last known location."
        : "Offline — showing saved contacts. Distances are unavailable.";
    }
    if (locFailed && !usableLoc) {
      return "Location unavailable — showing saved contacts. Distances are unavailable.";
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
            onClick={requestLocation}
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
          >
            {locStatus === "unavailable" ? "Try again" : "Enable location"}
          </button>
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
                    ? `${(nearest as any)._dist.toFixed(1)} km away${usableLoc && !locFresh ? " · approximate" : ""}`
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
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                {locStatus === "asking"
                  ? "Getting your location…"
                  : "Enable location to find the nearest station."}
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
                      className={`flex w-full items-center justify-between border-b border-border px-3 py-3 text-left last:border-b-0 ${
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

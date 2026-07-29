import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Phone, MapPin, Search, AlertTriangle, Flame, Shield, Users, RefreshCw, QrCode, Download } from "lucide-react";
import { listStations, syncStations, type Station } from "@/lib/stations.functions";
import { InstallPrompt } from "@/components/InstallPrompt";

const STATIONS_CACHE_KEY = "r9_stations_v1";

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
      { title: "Region 9 Emergency Contacts – Zamboanga City" },
      {
        name: "description",
        content:
          "Quick-dial emergency contacts for Zamboanga City fire sub-stations. Call the nearest station in one tap.",
      },
      { name: "theme-color", content: "#dc2626" },
      { property: "og:title", content: "Region 9 Emergency Contacts – Zamboanga City" },
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

function firstPhone(phone: string): string {
  return (phone.split(/[/,;]| or /i)[0] ?? "").trim();
}

function telHref(phone: string) {
  return `tel:${normalizePhone(firstPhone(phone))}`;
}

function formatPhoneList(phone: string): string {
  return phone
    .split(/[/,;]| or /i)
    .map((p) => normalizePhone(p))
    .filter(Boolean)
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

type Tab = "fire" | "police" | "barangay";

function Home() {
  const { data: stations } = useSuspenseQuery(stationsQuery);
  const router = useRouter();
  const sync = useServerFn(syncStations);
  const [tab, setTab] = useState<Tab>("fire");
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "asking" | "granted" | "denied" | "unavailable">(
    "idle",
  );
  const [nearestIdx, setNearestIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
      .sort((a, b) => (a as any)._dist - (b as any)._dist);
  }, [filtered, userLoc]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((s) => s.station_name.toLowerCase().includes(q));
  }, [filtered, search]);

  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocStatus("unavailable");
      return;
    }
    setLocStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocStatus("granted");
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  // On first load: ask location + fire background sync
  useEffect(() => {
    requestLocation();
    (async () => {
      try {
        await sync();
        router.invalidate();
      } catch (e) {
        console.warn("Background station sync failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nearest = nearestSorted[nearestIdx];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await sync();
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  };

  const selected = stations.find((s) => s.id === selectedId);

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-16">
      {/* Emergency banner */}
      <header className="sticky top-0 z-20 bg-emergency text-emergency-foreground shadow-lg">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-90">
            <AlertTriangle className="h-4 w-4" /> National Emergency Hotline
          </div>
          <a
            href="tel:911"
            className="mt-1 flex items-center justify-between gap-3 rounded-2xl bg-black/25 px-4 py-4 active:scale-[.98] transition"
          >
            <div>
              <div className="text-4xl font-black tracking-tight">911</div>
              <div className="text-sm opacity-90">Tap to call</div>
            </div>
            <Phone className="h-10 w-10" />
          </a>
        </div>
        <h1 className="px-4 pb-4 text-lg font-semibold">Region 9 Emergency Contacts</h1>
      </header>

      <InstallPrompt />

      {/* Location status */}
      {locStatus === "denied" || locStatus === "unavailable" ? (
        <div className="mx-4 mt-4 rounded-xl border border-border bg-card p-3 text-sm">
          <p className="mb-2">
            {locStatus === "unavailable"
              ? "Location is unavailable on this device."
              : "Location access is needed to find the station nearest to you."}
          </p>
          <button
            onClick={requestLocation}
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
          >
            Enable location
          </button>
        </div>
      ) : null}

      {/* Category tabs */}
      <nav className="mx-4 mt-4 grid grid-cols-3 gap-1 rounded-xl bg-card p-1">
        {[
          { id: "fire" as Tab, label: "Fire", Icon: Flame },
          { id: "police" as Tab, label: "Police", Icon: Shield },
          { id: "barangay" as Tab, label: "Barangay", Icon: Users },
        ].map(({ id, label, Icon }) => {
          const count = stations.filter((s) => s.category === id).length;
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setNearestIdx(0);
                setSelectedId("");
              }}
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-3 text-xs font-medium transition ${
                active ? "bg-emergency text-emergency-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
              <span className="text-[10px] opacity-70">{count} listed</span>
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
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Call nearest station
            </h2>
            {userLoc && nearest ? (
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {(nearest as any)._dist != null
                    ? `${(nearest as any)._dist.toFixed(1)} km away`
                    : "Nearest available"}
                </div>
                <div className="mt-1 text-xl font-bold">{nearest.station_name}</div>
                <div className="text-sm text-muted-foreground">{formatPhoneList(nearest.phone_number)}</div>
                <a
                  href={telHref(nearest.phone_number)}
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emergency py-4 text-lg font-bold text-emergency-foreground active:scale-[.98] transition"
                >
                  <Phone className="h-6 w-6" /> Call now
                </a>
                {nearestSorted.length > 1 && (
                  <button
                    onClick={() =>
                      setNearestIdx((i) => (i + 1) % nearestSorted.length)
                    }
                    className="mt-2 w-full rounded-xl border border-border py-3 text-sm font-medium"
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
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
              {selected && (
                <a
                  href={telHref(selected.phone_number)}
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emergency py-4 text-lg font-bold text-emergency-foreground active:scale-[.98] transition"
                >
                  <Phone className="h-6 w-6" /> Call {selected.station_name}
                </a>
              )}
            </div>
          </section>
        </>
      )}

      <footer className="mx-4 mt-8 flex items-center justify-between text-xs text-muted-foreground">
        <span>Region IX · Zamboanga City</span>
        <div className="flex items-center gap-4">
          <Link to="/install" className="flex items-center gap-1">
            <Download className="h-3 w-3" /> Install
          </Link>
          <Link to="/share" className="flex items-center gap-1">
            <QrCode className="h-3 w-3" /> Share
          </Link>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : "Refresh data"}
          </button>
        </div>
      </footer>
    </div>
  );
}

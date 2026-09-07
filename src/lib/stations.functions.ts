import { createServerFn } from "@tanstack/react-start";

const SOURCES = [
  {
    category: "fire",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSSD-MjlGYORQCPH2P0w-XvpUleBOo3PX94TlzEVZ5L-krG-WqcXf3phfFrMsIUe2_xBiJUGBaHG-Us/pub?output=csv",
  },
  {
    category: "barangay",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_Uu8K0zf2G32k3HdPBVHVbLxwBlzr5wVqAJGySHV0C2LBZpQgcUyVCDWAj1rLZ6wo_9uOzX-VpRfW/pub?output=csv",
  },
] as const;

// A bare 7-digit number is a Zamboanga City landline -> prefix area code 062.
function withAreaCode(raw: string): string {
  return raw
    .split(/[\/;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const digits = p.replace(/\D/g, "");
      return digits.length === 7 ? `062${digits}` : p;
    })
    .join("/");
}

export type Station = {
  id: string;
  station_name: string;
  phone_number: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
  municipality: string | null;
};

// Parse a CSV that may contain quoted fields with commas.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((v) => v.trim().length));
}

async function geocode(name: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const q = encodeURIComponent(`${name}, Zamboanga City, Philippines`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "User-Agent": "Region9EmergencyContacts/1.0" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// Minimum time between real syncs. Public callers that arrive sooner get a
// no-op result, so the endpoint can't be used to spam outbound Google Sheets /
// Nominatim requests or repeated privileged database writes.
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

// A manual tap of "Update" may bypass the throttle; automatic background
// refreshes may not.
const MANUAL_SYNC_COOLDOWN_MS = 20 * 1000;

export const syncStations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ({
    force: Boolean((data as { force?: unknown } | undefined)?.force),
  }))
  .handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Server-side throttle: bail out before any outbound call or write.
  const { data: last } = await supabaseAdmin
    .from("stations")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSyncedAt = last?.updated_at ?? null;
  if (lastSyncedAt) {
    const age = Date.now() - new Date(lastSyncedAt).getTime();
    const cooldown = data.force ? MANUAL_SYNC_COOLDOWN_MS : SYNC_COOLDOWN_MS;
    if (age < cooldown) {
      return { synced: 0, skipped: true as const, lastSyncedAt };
    }
  }

  const existing = await supabaseAdmin
    .from("stations")
    .select("station_name, latitude, longitude");
  const existingMap = new Map(
    (existing.data ?? []).map((s) => [s.station_name, s]),
  );

  let synced = 0;

  for (const source of SOURCES) {
    // Cache-buster: Google serves a cached copy of published sheets otherwise.
    const url = `${source.url}${source.url.includes("?") ? "&" : "?"}_cb=${Date.now()}`;
    const res = await fetch(url, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    const csv = await res.text();
    const rows = parseCsv(csv);
    if (rows.length < 2) continue;

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idxName = header.findIndex((h) => h.includes("station") || h.includes("barangay"));
    const idxPhone = header.findIndex(
      (h) => h.includes("hotline") || h.includes("phone") || h.includes("contact"),
    );
    const idxGps = header.findIndex((h) => h.includes("gps") || h.includes("coord"));
    if (idxName < 0 || idxPhone < 0) continue;

    for (const row of rows.slice(1)) {
      const name = (row[idxName] ?? "").trim();
      const phone = withAreaCode((row[idxPhone] ?? "").trim());
      if (!name || !phone) continue;

      let lat: number | null = null;
      let lon: number | null = null;
      const gps = idxGps >= 0 ? (row[idxGps] ?? "").trim() : "";
      if (gps) {
        const parts = gps.split(",").map((p) => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          lat = parts[0];
          lon = parts[1];
        }
      }

      // Geocode if missing and not already cached with coords
      const prev = existingMap.get(name);
      if ((lat === null || lon === null) && prev?.latitude && prev?.longitude) {
        lat = prev.latitude;
        lon = prev.longitude;
      } else if (lat === null || lon === null) {
        const g = await geocode(name);
        if (g) {
          lat = g.lat;
          lon = g.lon;
        }
        // gentle rate-limit for Nominatim
        await new Promise((r) => setTimeout(r, 1100));
      }

      await supabaseAdmin.from("stations").upsert(
        {
          station_name: name,
          phone_number: phone,
          latitude: lat,
          longitude: lon,
          category: source.category,
          municipality: "Zamboanga City",
          geocoded_at: lat && lon ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "station_name" },
      );
      synced++;
    }
  }

  return { synced, skipped: false as const, lastSyncedAt };
});

export const listStations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("stations")
    .select("id, station_name, phone_number, latitude, longitude, category, municipality")
    .order("station_name");
  if (error) throw error;
  return (data ?? []) as Station[];
});

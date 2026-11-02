import { createServerFn } from "@tanstack/react-start";

export type Station = {
  id: string;
  station_name: string;
  phone_number: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
  municipality: string | null;
};

export const syncStations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ({
    force: Boolean((data as { force?: unknown } | undefined)?.force),
  }))
  .handler(async ({ data }) => {
    // The actual sync logic lives in stations-sync.server.ts (server-only) so
    // the Google Sheets webhook route can run exactly the same code.
    const { runStationSync } = await import("@/lib/stations-sync.server");
    return runStationSync(data.force);
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

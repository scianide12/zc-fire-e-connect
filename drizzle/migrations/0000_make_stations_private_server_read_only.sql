-- The stations table was previously readable by anyone through the Data API
-- (policy "Stations are viewable by everyone" with USING (true)). The app only
-- reads this table through server-side privileged clients (station listing,
-- Google Sheets sync and the sync webhook), which bypass row-level security,
-- so public read access is unnecessary. Remove it so the table is private by
-- default and the emergency phone numbers are no longer directly downloadable
-- by anonymous API callers.

DROP POLICY IF EXISTS "Stations are viewable by everyone" ON public.stations;

-- Remove the now-unused anonymous read grant as well (RLS default-deny already
-- blocks, but the grant should not advertise access that no policy allows).
REVOKE ALL ON public.stations FROM anon;

COMMENT ON TABLE public.stations IS 'Emergency contact directory for Zamboanga City fire sub-stations and barangays. PRIVATE: no public read policy; reads happen only through server-side privileged clients (listing, Sheets sync, sync webhook).';
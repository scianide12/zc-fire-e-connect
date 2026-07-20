
CREATE TABLE public.stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_name TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  category TEXT NOT NULL DEFAULT 'fire',
  municipality TEXT,
  geocoded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stations TO anon;
GRANT SELECT ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stations are viewable by everyone"
  ON public.stations FOR SELECT
  USING (true);

CREATE INDEX idx_stations_category ON public.stations(category);

-- VISION ASTRAA Reference PostgreSQL + PostGIS Production Schema
-- Note: In the Google AI Studio sandbox, runtime persistence uses SQLite (better-sqlite3).
-- Use this migration when deploying VISION ASTRAA to a managed PostgreSQL + PostGIS cluster.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  institution TEXT,
  role TEXT NOT NULL DEFAULT 'researcher',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL,
  gravity_ms2 DOUBLE PRECISION NOT NULL,
  elevation_datum TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  planet_id TEXT NOT NULL REFERENCES planets(id),
  category TEXT NOT NULL,
  instrument TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  doi_or_identifier TEXT NOT NULL,
  file_format TEXT NOT NULL,
  spatial_resolution TEXT NOT NULL,
  spatial_resolution_meters DOUBLE PRECISION,
  units TEXT NOT NULL,
  crs TEXT NOT NULL,
  download_date TEXT NOT NULL,
  processing_status TEXT NOT NULL,
  quality_status TEXT NOT NULL,
  data_origin TEXT NOT NULL,
  file_size_bytes BIGINT,
  storage_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset_metadata (
  dataset_id TEXT PRIMARY KEY REFERENCES datasets(id) ON DELETE CASCADE,
  notes TEXT,
  processing_history JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS geographic_regions (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planet_id TEXT NOT NULL REFERENCES planets(id),
  country_or_quadrangle TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  centroid_geom GEOMETRY(Point, 4326),
  footprint_geom GEOMETRY(Polygon, 4326),
  spatial_extent_km2 DOUBLE PRECISION NOT NULL,
  data_origin TEXT NOT NULL,
  elevation_datum TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_regions_geom ON geographic_regions USING GIST (centroid_geom);

CREATE TABLE IF NOT EXISTS terrain_features (
  region_id TEXT PRIMARY KEY REFERENCES geographic_regions(id) ON DELETE CASCADE,
  elevation_min_m DOUBLE PRECISION NOT NULL,
  elevation_max_m DOUBLE PRECISION NOT NULL,
  elevation_mean_m DOUBLE PRECISION NOT NULL,
  elevation_median_m DOUBLE PRECISION NOT NULL,
  elevation_std_m DOUBLE PRECISION NOT NULL,
  elevation_relief_m DOUBLE PRECISION NOT NULL,
  slope_mean_deg DOUBLE PRECISION NOT NULL,
  slope_max_deg DOUBLE PRECISION NOT NULL,
  roughness_tri_m DOUBLE PRECISION NOT NULL,
  local_variability_m DOUBLE PRECISION NOT NULL,
  temp_mean_k DOUBLE PRECISION,
  feature_source_type TEXT NOT NULL,
  features_payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  steps_completed INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 4,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS similarity_analyses (
  id TEXT PRIMARY KEY,
  target_region_id TEXT NOT NULL REFERENCES geographic_regions(id),
  earth_region_id TEXT NOT NULL REFERENCES geographic_regions(id),
  similarity_score DOUBLE PRECISION NOT NULL,
  metric_used TEXT NOT NULL,
  normalization_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS similarity_results (
  analysis_id TEXT PRIMARY KEY REFERENCES similarity_analyses(id) ON DELETE CASCADE,
  feature_breakdown JSONB NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES similarity_analyses(id),
  title TEXT NOT NULL,
  report_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

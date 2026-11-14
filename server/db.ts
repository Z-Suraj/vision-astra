import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  ActivityLogEntry,
  AppSettings,
  DatasetRecord,
  GeographicRegion,
  PlanetInfo,
  ProcessingJob,
  ReportRecord,
  SimilarityResult,
} from '../src/types.ts';
import { buildSeedRegions, SEED_DATASETS, SEED_PLANETS } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'vision_astraa.db');
export const UPLOADS_PATH = UPLOAD_DIR;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS planets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      radius_km REAL NOT NULL,
      gravity_ms2 REAL NOT NULL,
      elevation_datum TEXT NOT NULL,
      primary_datasets_json TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      planet TEXT NOT NULL REFERENCES planets(id),
      category TEXT NOT NULL,
      instrument TEXT NOT NULL,
      provider TEXT NOT NULL,
      source_url TEXT NOT NULL,
      doi_or_identifier TEXT NOT NULL,
      file_format TEXT NOT NULL,
      spatial_resolution TEXT NOT NULL,
      spatial_resolution_meters REAL,
      units TEXT NOT NULL,
      crs TEXT NOT NULL,
      download_date TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      quality_status TEXT NOT NULL,
      data_origin TEXT NOT NULL,
      file_size_bytes INTEGER,
      file_path TEXT,
      notes TEXT NOT NULL,
      processing_history_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS geographic_regions (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      planet TEXT NOT NULL REFERENCES planets(id),
      country_or_quadrangle TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      spatial_extent_km2 REAL NOT NULL,
      data_origin TEXT NOT NULL,
      elevation_datum TEXT NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS terrain_features (
      region_id TEXT PRIMARY KEY REFERENCES geographic_regions(id) ON DELETE CASCADE,
      features_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processing_jobs (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      dataset_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      steps_completed INTEGER NOT NULL,
      total_steps INTEGER NOT NULL,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS similarity_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      target_region_id TEXT NOT NULL,
      earth_region_id TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      metric_used TEXT NOT NULL,
      normalization_method TEXT NOT NULL,
      result_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      analysis_id TEXT NOT NULL,
      target_region_name TEXT NOT NULL,
      target_planet TEXT NOT NULL,
      earth_region_name TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      summary_text TEXT NOT NULL,
      report_payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      severity TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
  `);

  const planetCount = (db.prepare('SELECT COUNT(*) as c FROM planets').get() as { c: number }).c;
  if (planetCount === 0) {
    const insertPlanet = db.prepare(`
      INSERT INTO planets (id, name, radius_km, gravity_ms2, elevation_datum, primary_datasets_json, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of SEED_PLANETS) {
      insertPlanet.run(
        p.id,
        p.name,
        p.radiusKm,
        p.gravityMs2,
        p.elevationDatum,
        JSON.stringify(p.primaryDatasets),
        p.description
      );
    }

    const insertDataset = db.prepare(`
      INSERT INTO datasets (
        id, name, planet, category, instrument, provider, source_url, doi_or_identifier,
        file_format, spatial_resolution, spatial_resolution_meters, units, crs, download_date,
        processing_status, quality_status, data_origin, file_size_bytes, file_path, notes, processing_history_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of SEED_DATASETS) {
      insertDataset.run(
        d.id,
        d.name,
        d.planet,
        d.category,
        d.instrument,
        d.provider,
        d.sourceUrl,
        d.doiOrIdentifier,
        d.fileFormat,
        d.spatialResolution,
        d.spatialResolutionMeters,
        d.units,
        d.crs,
        d.downloadDate,
        d.processingStatus,
        d.qualityStatus,
        d.dataOrigin,
        d.fileSizeBytes,
        null,
        d.notes,
        JSON.stringify(d.processingHistory)
      );
    }

    const insertRegion = db.prepare(`
      INSERT INTO geographic_regions (
        id, dataset_id, name, planet, country_or_quadrangle, latitude, longitude,
        spatial_extent_km2, data_origin, elevation_datum, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFeatures = db.prepare(`
      INSERT INTO terrain_features (region_id, features_json) VALUES (?, ?)
    `);

    const seedRegions = buildSeedRegions();
    for (const r of seedRegions) {
      insertRegion.run(
        r.id,
        r.datasetId,
        r.name,
        r.planet,
        r.countryOrQuadrangle,
        r.latitude,
        r.longitude,
        r.spatialExtentKm2,
        r.dataOrigin,
        r.elevationDatum,
        r.summary
      );
      insertFeatures.run(r.id, JSON.stringify(r.features));
    }

    logActivity(
      'System',
      'Reference Corpus Initialized',
      `Indexed ${SEED_DATASETS.length} planetary reference datasets and ${seedRegions.length} Earth/Moon/Mars regions.`,
      'info'
    );
  }

  const settingsRow = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get('main') as
    | { value_json: string }
    | undefined;
  if (!settingsRow) {
    const defaultSettings: AppSettings = {
      defaultNormalization: 'minmax',
      defaultMetric: 'weighted_euclidean',
      defaultWeights: {
        elevationRelief: 0.25,
        elevationStd: 0.15,
        slopeMean: 0.25,
        slopeMax: 0.1,
        roughnessTri: 0.2,
        temperatureMean: 0.05,
      },
      resampleGridSize: 32,
      includeTemperatureWhenAvailable: true,
      researcherName: 'Planetary Analog Researcher',
      institutionName: 'VISION ASTRAA Planetary Lab',
    };
    db.prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?)').run(
      'main',
      JSON.stringify(defaultSettings)
    );
  }
}

export function getPlanets(): PlanetInfo[] {
  const rows = db.prepare('SELECT * FROM planets').all() as Array<{
    id: string;
    name: string;
    radius_km: number;
    gravity_ms2: number;
    elevation_datum: string;
    primary_datasets_json: string;
    description: string;
  }>;
  return rows.map((r) => ({
    id: r.id as PlanetInfo['id'],
    name: r.name,
    radiusKm: r.radius_km,
    gravityMs2: r.gravity_ms2,
    elevationDatum: r.elevation_datum,
    primaryDatasets: JSON.parse(r.primary_datasets_json),
    description: r.description,
  }));
}

export function getDatasets(): DatasetRecord[] {
  const rows = db.prepare('SELECT * FROM datasets ORDER BY rowid DESC').all() as Array<Record<string, any>>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    planet: r.planet,
    category: r.category,
    instrument: r.instrument,
    provider: r.provider,
    sourceUrl: r.source_url,
    doiOrIdentifier: r.doi_or_identifier,
    fileFormat: r.file_format,
    spatialResolution: r.spatial_resolution,
    spatialResolutionMeters: r.spatial_resolution_meters,
    units: r.units,
    crs: r.crs,
    downloadDate: r.download_date,
    processingStatus: r.processing_status,
    qualityStatus: r.quality_status,
    dataOrigin: r.data_origin,
    fileSizeBytes: r.file_size_bytes,
    notes: r.notes,
    processingHistory: JSON.parse(r.processing_history_json),
  }));
}

export function getDatasetWithFilePath(id: string): (DatasetRecord & { filePath: string | null }) | null {
  const r = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    planet: r.planet,
    category: r.category,
    instrument: r.instrument,
    provider: r.provider,
    sourceUrl: r.source_url,
    doiOrIdentifier: r.doi_or_identifier,
    fileFormat: r.file_format,
    spatialResolution: r.spatial_resolution,
    spatialResolutionMeters: r.spatial_resolution_meters,
    units: r.units,
    crs: r.crs,
    downloadDate: r.download_date,
    processingStatus: r.processing_status,
    qualityStatus: r.quality_status,
    dataOrigin: r.data_origin,
    fileSizeBytes: r.file_size_bytes,
    filePath: r.file_path ?? null,
    notes: r.notes,
    processingHistory: JSON.parse(r.processing_history_json),
  };
}

export function insertDataset(dataset: DatasetRecord, filePath: string | null) {
  db.prepare(`
    INSERT INTO datasets (
      id, name, planet, category, instrument, provider, source_url, doi_or_identifier,
      file_format, spatial_resolution, spatial_resolution_meters, units, crs, download_date,
      processing_status, quality_status, data_origin, file_size_bytes, file_path, notes, processing_history_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    dataset.id,
    dataset.name,
    dataset.planet,
    dataset.category,
    dataset.instrument,
    dataset.provider,
    dataset.sourceUrl,
    dataset.doiOrIdentifier,
    dataset.fileFormat,
    dataset.spatialResolution,
    dataset.spatialResolutionMeters,
    dataset.units,
    dataset.crs,
    dataset.downloadDate,
    dataset.processingStatus,
    dataset.qualityStatus,
    dataset.dataOrigin,
    dataset.fileSizeBytes,
    filePath,
    dataset.notes,
    JSON.stringify(dataset.processingHistory)
  );
}

export function updateDatasetStatus(
  id: string,
  updates: {
    processingStatus?: DatasetRecord['processingStatus'];
    qualityStatus?: DatasetRecord['qualityStatus'];
    crs?: string;
    spatialResolution?: string;
    spatialResolutionMeters?: number | null;
    processingHistory?: DatasetRecord['processingHistory'];
  }
) {
  const existing = getDatasetWithFilePath(id);
  if (!existing) return;
  db.prepare(`
    UPDATE datasets
    SET processing_status = ?, quality_status = ?, crs = ?, spatial_resolution = ?, spatial_resolution_meters = ?, processing_history_json = ?
    WHERE id = ?
  `).run(
    updates.processingStatus ?? existing.processingStatus,
    updates.qualityStatus ?? existing.qualityStatus,
    updates.crs ?? existing.crs,
    updates.spatialResolution ?? existing.spatialResolution,
    updates.spatialResolutionMeters !== undefined ? updates.spatialResolutionMeters : existing.spatialResolutionMeters,
    JSON.stringify(updates.processingHistory ?? existing.processingHistory),
    id
  );
}

export function deleteDatasetById(id: string): boolean {
  const ds = getDatasetWithFilePath(id);
  if (!ds) return false;
  if (ds.filePath && fs.existsSync(ds.filePath)) {
    try {
      fs.unlinkSync(ds.filePath);
    } catch {
      // ignore fs cleanup errors
    }
  }
  db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
  return true;
}

export function upsertRegion(region: GeographicRegion) {
  db.prepare(`
    INSERT INTO geographic_regions (
      id, dataset_id, name, planet, country_or_quadrangle, latitude, longitude,
      spatial_extent_km2, data_origin, elevation_datum, summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      country_or_quadrangle = excluded.country_or_quadrangle,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      spatial_extent_km2 = excluded.spatial_extent_km2,
      elevation_datum = excluded.elevation_datum,
      summary = excluded.summary
  `).run(
    region.id,
    region.datasetId,
    region.name,
    region.planet,
    region.countryOrQuadrangle,
    region.latitude,
    region.longitude,
    region.spatialExtentKm2,
    region.dataOrigin,
    region.elevationDatum,
    region.summary
  );

  db.prepare(`
    INSERT INTO terrain_features (region_id, features_json) VALUES (?, ?)
    ON CONFLICT(region_id) DO UPDATE SET features_json = excluded.features_json
  `).run(region.id, JSON.stringify(region.features));
}

export function getRegions(planetFilter?: string): GeographicRegion[] {
  const sql = planetFilter
    ? `SELECT r.*, f.features_json FROM geographic_regions r JOIN terrain_features f ON r.id = f.region_id WHERE r.planet = ? ORDER BY r.rowid DESC`
    : `SELECT r.*, f.features_json FROM geographic_regions r JOIN terrain_features f ON r.id = f.region_id ORDER BY r.rowid DESC`;
  const rows = (planetFilter ? db.prepare(sql).all(planetFilter) : db.prepare(sql).all()) as Array<
    Record<string, any>
  >;
  return rows.map((r) => ({
    id: r.id,
    datasetId: r.dataset_id,
    name: r.name,
    planet: r.planet,
    countryOrQuadrangle: r.country_or_quadrangle,
    latitude: r.latitude,
    longitude: r.longitude,
    spatialExtentKm2: r.spatial_extent_km2,
    dataOrigin: r.data_origin,
    elevationDatum: r.elevation_datum,
    summary: r.summary,
    features: JSON.parse(r.features_json),
  }));
}

export function getRegionById(id: string): GeographicRegion | null {
  const r = db
    .prepare(
      `SELECT r.*, f.features_json FROM geographic_regions r JOIN terrain_features f ON r.id = f.region_id WHERE r.id = ?`
    )
    .get(id) as Record<string, any> | undefined;
  if (!r) return null;
  return {
    id: r.id,
    datasetId: r.dataset_id,
    name: r.name,
    planet: r.planet,
    countryOrQuadrangle: r.country_or_quadrangle,
    latitude: r.latitude,
    longitude: r.longitude,
    spatialExtentKm2: r.spatial_extent_km2,
    dataOrigin: r.data_origin,
    elevationDatum: r.elevation_datum,
    summary: r.summary,
    features: JSON.parse(r.features_json),
  };
}

export function createProcessingJob(job: ProcessingJob) {
  db.prepare(`
    INSERT INTO processing_jobs (id, dataset_id, dataset_name, status, started_at, completed_at, steps_completed, total_steps, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.datasetId,
    job.datasetName,
    job.status,
    job.startedAt,
    job.completedAt,
    job.stepsCompleted,
    job.totalSteps,
    job.message
  );
}

export function updateProcessingJob(id: string, updates: Partial<ProcessingJob>) {
  const existing = db.prepare('SELECT * FROM processing_jobs WHERE id = ?').get(id) as
    | Record<string, any>
    | undefined;
  if (!existing) return;
  db.prepare(`
    UPDATE processing_jobs
    SET status = ?, completed_at = ?, steps_completed = ?, message = ?
    WHERE id = ?
  `).run(
    updates.status ?? existing.status,
    updates.completedAt !== undefined ? updates.completedAt : existing.completed_at,
    updates.stepsCompleted ?? existing.steps_completed,
    updates.message ?? existing.message,
    id
  );
}

export function getProcessingJobs(): ProcessingJob[] {
  const rows = db.prepare('SELECT * FROM processing_jobs ORDER BY started_at DESC LIMIT 50').all() as Array<
    Record<string, any>
  >;
  return rows.map((r) => ({
    id: r.id,
    datasetId: r.dataset_id,
    datasetName: r.dataset_name,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    stepsCompleted: r.steps_completed,
    totalSteps: r.total_steps,
    message: r.message,
  }));
}

export function saveSimilarityAnalysis(result: SimilarityResult) {
  db.prepare(`
    INSERT INTO similarity_analyses (id, created_at, target_region_id, earth_region_id, similarity_score, metric_used, normalization_method, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.analysisId,
    result.createdAt,
    result.targetRegionId,
    result.earthRegionId,
    result.similarityScore,
    result.metricUsed,
    result.normalizationMethod,
    JSON.stringify(result)
  );
}

export function getSimilarityAnalyses(): SimilarityResult[] {
  const rows = db
    .prepare('SELECT result_json FROM similarity_analyses ORDER BY created_at DESC LIMIT 50')
    .all() as Array<{ result_json: string }>;
  return rows.map((r) => JSON.parse(r.result_json));
}

export function getSimilarityAnalysisById(id: string): SimilarityResult | null {
  const row = db
    .prepare('SELECT result_json FROM similarity_analyses WHERE id = ?')
    .get(id) as { result_json: string } | undefined;
  return row ? JSON.parse(row.result_json) : null;
}

export function saveReport(report: ReportRecord) {
  db.prepare(`
    INSERT INTO reports (id, title, created_at, analysis_id, target_region_name, target_planet, earth_region_name, similarity_score, summary_text, report_payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    report.id,
    report.title,
    report.createdAt,
    report.analysisId,
    report.targetRegionName,
    report.targetPlanet,
    report.earthRegionName,
    report.similarityScore,
    report.summaryText,
    JSON.stringify(report.reportPayload)
  );
}

export function getReports(): ReportRecord[] {
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 50').all() as Array<
    Record<string, any>
  >;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    analysisId: r.analysis_id,
    targetRegionName: r.target_region_name,
    targetPlanet: r.target_planet,
    earthRegionName: r.earth_region_name,
    similarityScore: r.similarity_score,
    summaryText: r.summary_text,
    reportPayload: JSON.parse(r.report_payload_json),
  }));
}

export function logActivity(
  module: string,
  action: string,
  detail: string,
  severity: ActivityLogEntry['severity'] = 'info'
) {
  const entry: ActivityLogEntry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    module,
    action,
    detail,
    severity,
  };
  db.prepare(`
    INSERT INTO activity_logs (id, timestamp, module, action, detail, severity)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.timestamp, entry.module, entry.action, entry.detail, entry.severity);
}

export function getActivityLogs(limit = 20): ActivityLogEntry[] {
  return db
    .prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as ActivityLogEntry[];
}

export function getAppSettings(): AppSettings {
  const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get('main') as {
    value_json: string;
  };
  return JSON.parse(row.value_json);
}

export function updateAppSettings(settings: AppSettings) {
  db.prepare('UPDATE app_settings SET value_json = ? WHERE key = ?').run(
    JSON.stringify(settings),
    'main'
  );
}

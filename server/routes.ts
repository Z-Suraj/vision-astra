import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import {
  createProcessingJob,
  deleteDatasetById,
  getActivityLogs,
  getAppSettings,
  getDatasets,
  getDatasetWithFilePath,
  getPlanets,
  getProcessingJobs,
  getRegionById,
  getRegions,
  getReports,
  getSimilarityAnalyses,
  getSimilarityAnalysisById,
  insertDataset,
  logActivity,
  saveReport,
  saveSimilarityAnalysis,
  updateAppSettings,
  updateDatasetStatus,
  updateProcessingJob,
  upsertRegion,
  UPLOADS_PATH,
} from './db.ts';
import {
  extractTerrainFeaturesFromGrid,
  parseCsvElevation,
  parseGeoTiffBuffer,
  parseJsonElevation,
  parseRawImgBuffer,
  ParsedRasterInput,
} from './geospatial.ts';
import { computePairwiseSimilarity, runKMeansClustering } from './similarity.ts';
import { askScientificAssistant } from './gemini.ts';
import {
  AppSettings,
  DatasetCategory,
  DatasetRecord,
  DataOrigin,
  GeographicRegion,
  NormalizationMethod,
  PlanetId,
  ProcessingStepLog,
  ReportRecord,
  SimilarityMetric,
  SimilarityWeights,
} from '../src/types.ts';

const ALLOWED_EXTENSIONS = new Set(['.tif', '.tiff', '.csv', '.txt', '.json', '.geojson', '.img', '.bin']);

const upload = multer({
  dest: UPLOADS_PATH,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error(`Unsupported file extension "${ext}". Supported: GeoTIFF (.tif/.tiff), CSV, GeoJSON/JSON, PDS IMG (.img).`));
      return;
    }
    cb(null, true);
  },
});

function generateSampleElevationCsv(kind: 'mars_crater' | 'moon_rim' | 'earth_basin'): string {
  const rows: string[] = ['lat,lon,elevation_m,temp_k'];
  const size = 24;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ny = (r / (size - 1)) * 2 - 1;
      const nx = (c / (size - 1)) * 2 - 1;
      const d = Math.sqrt(nx * nx + ny * ny);
      let lat = 0;
      let lon = 0;
      let elev = 0;
      let temp = 215;

      if (kind === 'mars_crater') {
        lat = 18.2 + (r / size) * 0.4;
        lon = 77.4 + (c / size) * 0.4;
        const rim = Math.exp(-((d - 0.68) ** 2) / 0.028) * 580;
        const bowl = d < 0.68 ? -390 * (1 - (d / 0.68) ** 2) : -90 * d;
        const deltaFan = nx < 0 ? Math.exp(-((ny * 2.5) ** 2)) * 120 * (1 + nx) : 0;
        const noise = Math.sin(r * 2.3 + c * 1.7) * 18;
        elev = -2380 + rim + bowl + deltaFan + noise;
        temp = 214 - (elev + 2380) * 0.008 + Math.sin(r * 0.4) * 5;
      } else if (kind === 'moon_rim') {
        lat = -89.8 + (r / size) * 0.25;
        lon = 129.5 + (c / size) * 0.5;
        const rim = Math.exp(-((d - 0.65) ** 2) / 0.025) * 1250;
        const bowl = d < 0.65 ? -2150 * (1 - (d / 0.65) ** 2) : -220 * d;
        elev = 120 + rim + bowl + Math.cos(r * 1.9 - c * 2.1) * 42;
        temp = d < 0.45 ? 68 : 165;
      } else {
        lat = -24.15 + (r / size) * 0.3;
        lon = -69.98 + (c / size) * 0.3;
        const rim = Math.exp(-((d - 0.65) ** 2) / 0.03) * 490;
        const basin = d < 0.65 ? -290 * (1 - (d / 0.65) ** 2) : -60 * d;
        elev = 980 + rim + basin + Math.sin(r * 1.8 + c * 1.4) * 16;
        temp = 291 - (elev - 980) * 0.0065;
      }
      rows.push(`${lat.toFixed(5)},${lon.toFixed(5)},${elev.toFixed(2)},${temp.toFixed(2)}`);
    }
  }
  return rows.join('\n');
}

async function processDatasetFile(
  dataset: DatasetRecord & { filePath: string | null },
  regionOverrides?: { name?: string; lat?: number; lon?: number; countryOrQuadrangle?: string; summary?: string }
) {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();
  createProcessingJob({
    id: jobId,
    datasetId: dataset.id,
    datasetName: dataset.name,
    status: 'processing',
    startedAt,
    completedAt: null,
    stepsCompleted: 0,
    totalSteps: 4,
    message: 'Ingesting and validating source raster...',
  });

  const history: ProcessingStepLog[] = [...dataset.processingHistory];
  const settings = getAppSettings();

  try {
    if (!dataset.filePath || !fs.existsSync(dataset.filePath)) {
      throw new Error('No uploaded raw file is attached to this dataset record.');
    }

    const ext = path.extname(dataset.filePath).toLowerCase();
    const buf = fs.readFileSync(dataset.filePath);
    let parsed: ParsedRasterInput;

    if (ext === '.tif' || ext === '.tiff') {
      parsed = await parseGeoTiffBuffer(buf);
    } else if (ext === '.csv' || ext === '.txt') {
      parsed = parseCsvElevation(buf.toString('utf8'));
    } else if (ext === '.json' || ext === '.geojson') {
      parsed = parseJsonElevation(buf.toString('utf8'));
    } else if (ext === '.img' || ext === '.bin') {
      parsed = parseRawImgBuffer(buf);
    } else {
      throw new Error(`Unsupported file extension ${ext}`);
    }

    history.push({
      timestamp: new Date().toISOString(),
      step: 'Step 1 · Data Ingestion & Format Validation',
      status: 'completed',
      detail: `Parsed ${parsed.nativeRows}×${parsed.nativeCols} grid (${parsed.validPixelCount} valid cells, ${parsed.noDataCount} NoData filtered).`,
    });
    updateProcessingJob(jobId, { stepsCompleted: 1, message: 'Resampling & aligning CRS grid...' });

    history.push({
      timestamp: new Date().toISOString(),
      step: 'Step 2 · Preprocessing & Resolution Harmonization',
      status: parsed.warnings.length > 0 ? 'warning' : 'completed',
      detail: `Resampled to ${settings.resampleGridSize}×${settings.resampleGridSize} analysis matrix (${parsed.cellSizeMeters.toFixed(1)} m nominal spacing). ${parsed.warnings.join(' ')}`.trim(),
    });
    updateProcessingJob(jobId, { stepsCompleted: 2, message: 'Extracting elevation, slope, and TRI roughness...' });

    const regionId = `reg-${dataset.id}`;
    const features = extractTerrainFeaturesFromGrid(regionId, parsed.rawGrid, parsed.cellSizeMeters, {
      temperatureGrid: parsed.tempGrid,
      featureSourceType: 'PARSED_RASTER_MATRIX',
      targetGridSize: settings.resampleGridSize,
      geologyNotes: `Extracted directly from uploaded ${dataset.fileFormat} raster (${parsed.validPixelCount} valid elevation samples).`,
    });

    history.push({
      timestamp: new Date().toISOString(),
      step: 'Step 3 · Geomorphometric Feature Extraction',
      status: 'completed',
      detail: `Computed Relief=${features.elevationReliefM} m, Mean Slope=${features.slopeMeanDeg}°, TRI=${features.roughnessTriM} m.`,
    });
    updateProcessingJob(jobId, { stepsCompleted: 3, message: 'Storing spatial region & terrain features...' });

    const planets = getPlanets();
    const planetMeta = planets.find((p) => p.id === dataset.planet);
    const centerLat =
      regionOverrides?.lat ??
      (parsed.bounds ? Number(((parsed.bounds.minLat + parsed.bounds.maxLat) / 2).toFixed(4)) : 0);
    const centerLon =
      regionOverrides?.lon ??
      (parsed.bounds ? Number(((parsed.bounds.minLon + parsed.bounds.maxLon) / 2).toFixed(4)) : 0);
    const extentKm2 = Number(
      (((parsed.nativeRows * parsed.cellSizeMeters) / 1000) * ((parsed.nativeCols * parsed.cellSizeMeters) / 1000)).toFixed(2)
    );

    const region: GeographicRegion = {
      id: regionId,
      datasetId: dataset.id,
      name: regionOverrides?.name || `${dataset.name} Region`,
      planet: dataset.planet,
      countryOrQuadrangle:
        regionOverrides?.countryOrQuadrangle ||
        (dataset.dataOrigin === 'SAMPLE_DEMONSTRATION' ? 'Sample Demonstration Extent' : 'User Uploaded Extent'),
      latitude: centerLat,
      longitude: centerLon,
      spatialExtentKm2: Math.max(1, extentKm2),
      dataOrigin: dataset.dataOrigin,
      elevationDatum: planetMeta?.elevationDatum || dataset.crs,
      summary:
        regionOverrides?.summary ||
        `Processed from ${dataset.fileFormat} (${parsed.nativeRows}×${parsed.nativeCols} native cells, CRS: ${parsed.crs}).`,
      features,
    };

    upsertRegion(region);

    history.push({
      timestamp: new Date().toISOString(),
      step: 'Step 4 · Spatial Feature Storage',
      status: 'completed',
      detail: `Stored region "${region.name}" (${region.id}) in spatial catalog.`,
    });

    updateDatasetStatus(dataset.id, {
      processingStatus: 'completed',
      qualityStatus: dataset.dataOrigin === 'SAMPLE_DEMONSTRATION' ? 'sample_demo' : 'verified_upload',
      crs: parsed.crs,
      spatialResolution: `${parsed.cellSizeMeters.toFixed(1)} m/px`,
      spatialResolutionMeters: Number(parsed.cellSizeMeters.toFixed(2)),
      processingHistory: history,
    });

    updateProcessingJob(jobId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      stepsCompleted: 4,
      message: `Completed feature extraction for ${region.name}.`,
    });

    logActivity('Geospatial Pipeline', 'Dataset Processed', `Extracted terrain features for "${region.name}".`, 'success');

    return { jobId, region, features, warnings: parsed.warnings };
  } catch (err: any) {
    history.push({
      timestamp: new Date().toISOString(),
      step: 'Pipeline Execution Error',
      status: 'failed',
      detail: err?.message || 'Failed to parse or process dataset.',
    });
    updateDatasetStatus(dataset.id, {
      processingStatus: 'failed',
      qualityStatus: 'incomplete',
      processingHistory: history,
    });
    updateProcessingJob(jobId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      message: err?.message || 'Processing failed.',
    });
    logActivity('Geospatial Pipeline', 'Processing Failed', `${dataset.name}: ${err?.message}`, 'error');
    throw err;
  }
}

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vision-astraa-api', timestamp: new Date().toISOString() });
  });

  router.get('/dashboard/summary', (_req, res) => {
    const datasets = getDatasets();
    const regions = getRegions();
    const jobs = getProcessingJobs();
    const analyses = getSimilarityAnalyses();
    const reports = getReports();
    const planets = getPlanets();
    const recentActivities = getActivityLogs(15);

    res.json({
      counts: {
        totalDatasets: datasets.length,
        earthDatasets: datasets.filter((d) => d.planet === 'earth').length,
        moonDatasets: datasets.filter((d) => d.planet === 'moon').length,
        marsDatasets: datasets.filter((d) => d.planet === 'mars').length,
        processedRegions: regions.length,
        completedComparisons: analyses.length,
        processingJobs: jobs.length,
        reportsGenerated: reports.length,
      },
      planets,
      recentActivities,
      recentJobs: jobs.slice(0, 6),
      recentAnalyses: analyses.slice(0, 6),
    });
  });

  router.get('/planets', (_req, res) => {
    res.json(getPlanets());
  });

  router.get('/datasets', (req, res) => {
    let list = getDatasets();
    const { planet, category } = req.query;
    if (planet && planet !== 'all') {
      list = list.filter((d) => d.planet === planet);
    }
    if (category && category !== 'all') {
      list = list.filter((d) => d.category === category);
    }
    res.json(list);
  });

  router.get('/datasets/sample-template/:type', (req, res) => {
    const type = req.params.type;
    if (type !== 'mars_crater' && type !== 'moon_rim' && type !== 'earth_basin') {
      res.status(400).json({ error: 'Unknown sample template type. Use mars_crater, moon_rim, or earth_basin.' });
      return;
    }
    const csv = generateSampleElevationCsv(type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vision_astraa_sample_${type}.csv"`);
    res.send(csv);
  });

  router.post('/datasets/load-sample', async (req, res) => {
    try {
      const sampleType = (req.body?.sampleType as 'mars_crater' | 'moon_rim' | 'earth_basin') || 'mars_crater';
      const csv = generateSampleElevationCsv(sampleType);
      const id = `ds-sample-${sampleType}-${Date.now()}`;
      const filePath = path.join(UPLOADS_PATH, `${id}.csv`);
      fs.writeFileSync(filePath, csv, 'utf8');

      const metaMap = {
        mars_crater: {
          name: 'Sample Mars Crater Elevation Grid (Demonstration)',
          planet: 'mars' as PlanetId,
          instrument: 'MOLA-Style Synthetic Demonstration Grid',
          lat: 18.38,
          lon: 77.58,
          quad: 'Demonstration Mars Extent',
          summary: 'Explicitly labeled sample demonstration Mars crater elevation & thermal CSV grid for testing the geospatial processing pipeline.',
        },
        moon_rim: {
          name: 'Sample Lunar South Pole Rim Grid (Demonstration)',
          planet: 'moon' as PlanetId,
          instrument: 'LOLA-Style Synthetic Demonstration Grid',
          lat: -89.67,
          lon: 129.78,
          quad: 'Demonstration Lunar Polar Extent',
          summary: 'Explicitly labeled sample demonstration Lunar crater rim elevation & thermal CSV grid for testing.',
        },
        earth_basin: {
          name: 'Sample Terrestrial Evaporite Crater Grid (Demonstration)',
          planet: 'earth' as PlanetId,
          instrument: 'SRTM-Style Synthetic Demonstration Grid',
          lat: -24.08,
          lon: -69.92,
          quad: 'Demonstration Earth Extent',
          summary: 'Explicitly labeled sample demonstration Earth elevation & LST CSV grid for testing.',
        },
      }[sampleType];

      const ds: DatasetRecord = {
        id,
        name: metaMap.name,
        planet: metaMap.planet,
        category: 'elevation',
        instrument: metaMap.instrument,
        provider: 'VISION ASTRAA Demonstration Generator',
        sourceUrl: 'local://sample-demonstration',
        doiOrIdentifier: `DEMO-${sampleType.toUpperCase()}`,
        fileFormat: 'CSV (24×24 Grid)',
        spatialResolution: 'Pending extraction',
        spatialResolutionMeters: null,
        units: 'meters',
        crs: 'Geographic Lat/Lon',
        downloadDate: new Date().toISOString().slice(0, 10),
        processingStatus: 'pending',
        qualityStatus: 'sample_demo',
        dataOrigin: 'SAMPLE_DEMONSTRATION',
        fileSizeBytes: Buffer.byteLength(csv, 'utf8'),
        notes: 'Explicitly marked SAMPLE_DEMONSTRATION dataset. Do not cite as real NASA PDS telemetry.',
        processingHistory: [
          {
            timestamp: new Date().toISOString(),
            step: 'Sample Grid Generated',
            status: 'completed',
            detail: `Created ${Buffer.byteLength(csv, 'utf8')} byte demonstration CSV grid.`,
          },
        ],
      };

      insertDataset(ds, filePath);
      const fullDs = getDatasetWithFilePath(id)!;
      const result = await processDatasetFile(fullDs, {
        name: metaMap.name,
        lat: metaMap.lat,
        lon: metaMap.lon,
        countryOrQuadrangle: metaMap.quad,
        summary: metaMap.summary,
      });

      res.json({ dataset: getDatasetWithFilePath(id), ...result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load sample dataset.' });
    }
  });

  router.post('/datasets/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No dataset file provided.' });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const renamedPath = `${req.file.path}${ext}`;
      fs.renameSync(req.file.path, renamedPath);

      const planet = (req.body.planet as PlanetId) || 'mars';
      const category = (req.body.category as DatasetCategory) || 'elevation';
      const id = `ds-up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const isSample = req.body.isSample === 'true';
      const origin: DataOrigin = isSample ? 'SAMPLE_DEMONSTRATION' : 'UPLOADED_RASTER';

      const ds: DatasetRecord = {
        id,
        name: req.body.name?.trim() || req.file.originalname,
        planet,
        category,
        instrument: req.body.instrument?.trim() || 'User-Provided Geospatial Sensor',
        provider: req.body.provider?.trim() || 'Direct Researcher Upload',
        sourceUrl: req.body.sourceUrl?.trim() || 'upload://local-file',
        doiOrIdentifier: req.body.doiOrIdentifier?.trim() || `LOCAL-${id.slice(-6).toUpperCase()}`,
        fileFormat: ext.replace('.', '').toUpperCase(),
        spatialResolution: req.body.spatialResolution?.trim() || 'Pending inspection',
        spatialResolutionMeters: req.body.spatialResolutionMeters ? Number(req.body.spatialResolutionMeters) : null,
        units: req.body.units?.trim() || 'meters',
        crs: req.body.crs?.trim() || 'Pending CRS inspection',
        downloadDate: new Date().toISOString().slice(0, 10),
        processingStatus: 'pending',
        qualityStatus: isSample ? 'sample_demo' : 'verified_upload',
        dataOrigin: origin,
        fileSizeBytes: req.file.size,
        notes: req.body.notes?.trim() || `Uploaded file: ${req.file.originalname}`,
        processingHistory: [
          {
            timestamp: new Date().toISOString(),
            step: 'File Uploaded & Validated',
            status: 'completed',
            detail: `Received ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB).`,
          },
        ],
      };

      insertDataset(ds, renamedPath);
      logActivity('Data Center', 'Dataset Uploaded', `Registered "${ds.name}" (${ds.fileFormat}, ${ds.planet.toUpperCase()}).`, 'info');

      if (req.body.autoProcess === 'true') {
        const fullDs = getDatasetWithFilePath(id)!;
        const processed = await processDatasetFile(fullDs, {
          name: req.body.regionName?.trim() || ds.name,
          lat: req.body.latitude ? Number(req.body.latitude) : undefined,
          lon: req.body.longitude ? Number(req.body.longitude) : undefined,
          countryOrQuadrangle: req.body.countryOrQuadrangle?.trim(),
        });
        res.status(201).json({ dataset: getDatasetWithFilePath(id), ...processed });
        return;
      }

      res.status(201).json({ dataset: ds });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Dataset upload failed.' });
    }
  });

  router.get('/datasets/:id', (req, res) => {
    const ds = getDatasetWithFilePath(req.params.id);
    if (!ds) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }
    res.json(ds);
  });

  router.post('/datasets/:id/process', async (req, res) => {
    const ds = getDatasetWithFilePath(req.params.id);
    if (!ds) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }
    if (!ds.filePath) {
      res.status(400).json({
        error:
          'This record is a Published Observation Reference Summary without an attached raw raster file. Upload a GeoTIFF, CSV, GeoJSON, or IMG file to execute pixel-level raster processing.',
      });
      return;
    }
    try {
      const result = await processDatasetFile(ds, req.body);
      res.json({ dataset: getDatasetWithFilePath(ds.id), ...result });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Processing failed.' });
    }
  });

  router.delete('/datasets/:id', (req, res) => {
    const ds = getDatasetWithFilePath(req.params.id);
    if (!ds) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }
    deleteDatasetById(req.params.id);
    logActivity('Data Center', 'Dataset Deleted', `Removed dataset "${ds.name}" and derived region features.`, 'warning');
    res.json({ deleted: true, id: req.params.id });
  });

  router.get('/regions', (req, res) => {
    const planet = req.query.planet as string | undefined;
    res.json(getRegions(planet && planet !== 'all' ? planet : undefined));
  });

  router.get('/regions/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const planet = String(req.query.planet || 'all').toLowerCase();
    let list = getRegions(planet !== 'all' ? planet : undefined);
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.countryOrQuadrangle.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.features.geomorphologyClass.toLowerCase().includes(q)
      );
    }
    res.json(list);
  });

  router.get('/terrain/features', (req, res) => {
    const regionId = String(req.query.regionId || '');
    if (regionId) {
      const region = getRegionById(regionId);
      if (!region) {
        res.status(404).json({ error: 'Region not found.' });
        return;
      }
      res.json(region.features);
      return;
    }
    res.json(getRegions().map((r) => ({ ...r.features, name: r.name, planet: r.planet })));
  });

  const handleCompare = (req: any, res: any) => {
    const {
      targetRegionId,
      earthRegionId,
      weights,
      normalizationMethod = 'minmax',
      metricUsed = 'weighted_euclidean',
      includeTemperature = true,
    } = req.body as {
      targetRegionId: string;
      earthRegionId: string;
      weights?: SimilarityWeights;
      normalizationMethod?: NormalizationMethod;
      metricUsed?: SimilarityMetric;
      includeTemperature?: boolean;
    };

    const target = getRegionById(targetRegionId);
    const earth = getRegionById(earthRegionId);
    if (!target || !earth) {
      res.status(404).json({ error: 'Target or Earth region not found.' });
      return;
    }

    const settings = getAppSettings();
    const activeWeights = weights || settings.defaultWeights;
    const corpus = getRegions();
    const result = computePairwiseSimilarity(
      target,
      earth,
      corpus,
      activeWeights,
      normalizationMethod,
      metricUsed,
      includeTemperature
    );

    saveSimilarityAnalysis(result);
    logActivity(
      'Terrain Comparison',
      'Similarity Computed',
      `Compared ${target.name} (${target.planet.toUpperCase()}) vs ${earth.name}: ${result.similarityScore.toFixed(1)}/100.`,
      'success'
    );
    res.json({ result, targetRegion: target, earthRegion: earth });
  };

  router.post('/terrain/compare', handleCompare);
  router.post('/terrain/similarity', handleCompare);

  router.post('/terrain/cluster', (req, res) => {
    const k = Math.max(2, Math.min(6, Number(req.body?.k) || 4));
    const regions = getRegions();
    const clusters = runKMeansClustering(regions, k);
    res.json({ k, totalRegions: regions.length, clusters });
  });

  router.post('/analog-finder/search', (req, res) => {
    const {
      targetRegionId,
      weights,
      normalizationMethod = 'minmax',
      metricUsed = 'weighted_euclidean',
      includeTemperature = true,
      limit = 10,
    } = req.body as {
      targetRegionId: string;
      weights?: SimilarityWeights;
      normalizationMethod?: NormalizationMethod;
      metricUsed?: SimilarityMetric;
      includeTemperature?: boolean;
      limit?: number;
    };

    const target = getRegionById(targetRegionId);
    if (!target) {
      res.status(404).json({ error: 'Selected target planetary region not found.' });
      return;
    }

    const corpus = getRegions();
    const earthCandidates = corpus.filter((r) => r.planet === 'earth');
    if (earthCandidates.length === 0) {
      res.status(404).json({ error: 'No processed Earth regions available in the catalog.' });
      return;
    }

    const settings = getAppSettings();
    const activeWeights = weights || settings.defaultWeights;

    const ranked = earthCandidates
      .map((earth) =>
        computePairwiseSimilarity(
          target,
          earth,
          corpus,
          activeWeights,
          normalizationMethod,
          metricUsed,
          includeTemperature
        )
      )
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, Math.min(10, Math.max(1, limit)));

    if (ranked[0]) {
      saveSimilarityAnalysis(ranked[0]);
    }
    logActivity(
      'Earth Analog Finder',
      'Analog Search Completed',
      `Ranked top ${ranked.length} Earth analogues for ${target.name} (Top: ${ranked[0]?.earthRegionName ?? 'N/A'} @ ${ranked[0]?.similarityScore.toFixed(1) ?? 0}/100).`,
      'success'
    );

    res.json({
      targetRegion: target,
      metricUsed,
      normalizationMethod,
      totalEarthCandidates: earthCandidates.length,
      matches: ranked,
      warnings: ranked[0]?.warnings ?? [],
    });
  });

  router.get('/analysis/jobs', (_req, res) => {
    res.json(getProcessingJobs());
  });

  router.get('/analysis/jobs/:id', (req, res) => {
    const job = getProcessingJobs().find((j) => j.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json(job);
  });

  router.get('/analyses', (_req, res) => {
    res.json(getSimilarityAnalyses());
  });

  router.get('/reports', (_req, res) => {
    res.json(getReports());
  });

  router.post('/reports', (req, res) => {
    const { analysisId, title } = req.body as { analysisId: string; title?: string };
    const analysis = getSimilarityAnalysisById(analysisId);
    if (!analysis) {
      res.status(404).json({ error: 'Similarity analysis record not found. Run a comparison first.' });
      return;
    }

    const targetRegion = getRegionById(analysis.targetRegionId);
    const earthRegion = getRegionById(analysis.earthRegionId);
    if (!targetRegion || !earthRegion) {
      res.status(404).json({ error: 'Underlying region metadata no longer exists.' });
      return;
    }

    const allDatasets = getDatasets();
    const datasetsUsed = allDatasets.filter(
      (d) => d.id === targetRegion.datasetId || d.id === earthRegion.datasetId
    );

    const limitations = [
      'EXPLORATORY ANALYSIS NOTICE: This report is generated for exploratory geospatial terrain analog research and does not constitute a peer-reviewed scientific conclusion.',
      ...analysis.warnings,
      'Terrain similarity evaluates geomorphometric elevation relief, slope, and roughness (TRI); mineralogical composition, atmospheric pressure, and subsurface volatiles require dedicated spectral/radar datasets.',
    ];

    const citations = datasetsUsed.map(
      (d) => `${d.provider} (${d.downloadDate}). ${d.name}. Instrument: ${d.instrument}. Identifier/DOI: ${d.doiOrIdentifier}. Source: ${d.sourceUrl}`
    );

    const report: ReportRecord = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title:
        title?.trim() ||
        `Planetary Terrain Analog Report: ${targetRegion.name} vs ${earthRegion.name}`,
      createdAt: new Date().toISOString(),
      analysisId: analysis.analysisId,
      targetRegionName: targetRegion.name,
      targetPlanet: targetRegion.planet,
      earthRegionName: earthRegion.name,
      similarityScore: analysis.similarityScore,
      summaryText: analysis.explanation,
      reportPayload: {
        targetRegion,
        earthRegion,
        result: analysis,
        datasetsUsed,
        limitations,
        citations,
      },
    };

    saveReport(report);
    logActivity('Reports', 'Report Compiled', `Generated report "${report.title}".`, 'success');
    res.status(201).json(report);
  });

  router.post('/assistant/chat', async (req, res) => {
    try {
      const { question, targetRegionId, earthRegionId, analysisId, history } = req.body as {
        question: string;
        targetRegionId?: string;
        earthRegionId?: string;
        analysisId?: string;
        history?: { role: 'user' | 'assistant'; text: string }[];
      };

      if (!question?.trim()) {
        res.status(400).json({ error: 'Question cannot be empty.' });
        return;
      }

      const datasets = getDatasets();
      const targetRegion = targetRegionId ? getRegionById(targetRegionId) : null;
      const earthRegion = earthRegionId ? getRegionById(earthRegionId) : null;
      const analysis = analysisId ? getSimilarityAnalysisById(analysisId) : getSimilarityAnalyses()[0] ?? null;

      // Strip massive 32x32 matrices from LLM prompt to keep token usage lean and exact
      const sanitizeRegion = (r: GeographicRegion | null) =>
        r
          ? {
              id: r.id,
              name: r.name,
              planet: r.planet,
              countryOrQuadrangle: r.countryOrQuadrangle,
              latitude: r.latitude,
              longitude: r.longitude,
              spatialExtentKm2: r.spatialExtentKm2,
              dataOrigin: r.dataOrigin,
              elevationDatum: r.elevationDatum,
              summary: r.summary,
              metrics: {
                elevationMinM: r.features.elevationMinM,
                elevationMaxM: r.features.elevationMaxM,
                elevationMeanM: r.features.elevationMeanM,
                elevationStdM: r.features.elevationStdM,
                elevationReliefM: r.features.elevationReliefM,
                slopeMeanDeg: r.features.slopeMeanDeg,
                slopeMaxDeg: r.features.slopeMaxDeg,
                roughnessTriM: r.features.roughnessTriM,
                tempMeanK: r.features.tempMeanK,
                geomorphologyClass: r.features.geomorphologyClass,
                geologyNotes: r.features.geologyNotes,
                featureSourceType: r.features.featureSourceType,
                cellSizeMeters: r.features.cellSizeMeters,
                missingFields: r.features.missingFields,
              },
            }
          : null;

      const contextPayload = {
        catalogOverview: {
          totalDatasets: datasets.length,
          datasets: datasets.map((d) => ({
            id: d.id,
            name: d.name,
            planet: d.planet,
            instrument: d.instrument,
            provider: d.provider,
            doi: d.doiOrIdentifier,
            resolution: d.spatialResolution,
            dataOrigin: d.dataOrigin,
          })),
        },
        selectedTargetRegion: sanitizeRegion(targetRegion),
        selectedEarthRegion: sanitizeRegion(earthRegion),
        activeSimilarityAnalysis: analysis,
      };

      const reply = await askScientificAssistant({ question, contextPayload, history });
      res.json(reply);
    } catch (err: any) {
      const msg = err?.message || 'AI Assistant call failed.';
      const status = msg.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: msg });
    }
  });

  router.get('/settings', (_req, res) => {
    res.json(getAppSettings());
  });

  router.put('/settings', (req, res) => {
    const current = getAppSettings();
    const updated: AppSettings = { ...current, ...req.body };
    updateAppSettings(updated);
    logActivity('Settings', 'Configuration Updated', 'Saved similarity weights and processing settings.', 'info');
    res.json(updated);
  });

  return router;
}

export type PlanetId = 'earth' | 'moon' | 'mars';

export type DatasetCategory =
  | 'elevation'
  | 'slope'
  | 'roughness'
  | 'temperature'
  | 'imagery'
  | 'geology';

export type DataOrigin =
  | 'OBSERVATION_REFERENCE'
  | 'UPLOADED_RASTER'
  | 'SAMPLE_DEMONSTRATION';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type QualityStatus = 'verified_upload' | 'reference_summary' | 'sample_demo' | 'incomplete';

export interface PlanetInfo {
  id: PlanetId;
  name: string;
  radiusKm: number;
  gravityMs2: number;
  elevationDatum: string;
  primaryDatasets: string[];
  description: string;
}

export interface DatasetRecord {
  id: string;
  name: string;
  planet: PlanetId;
  category: DatasetCategory;
  instrument: string;
  provider: string;
  sourceUrl: string;
  doiOrIdentifier: string;
  fileFormat: string;
  spatialResolution: string;
  spatialResolutionMeters: number | null;
  units: string;
  crs: string;
  downloadDate: string;
  processingStatus: ProcessingStatus;
  qualityStatus: QualityStatus;
  dataOrigin: DataOrigin;
  fileSizeBytes: number | null;
  notes: string;
  processingHistory: ProcessingStepLog[];
}

export interface ProcessingStepLog {
  timestamp: string;
  step: string;
  status: 'completed' | 'warning' | 'failed';
  detail: string;
}

export interface TerrainFeatureMetrics {
  regionId: string;
  elevationMinM: number;
  elevationMaxM: number;
  elevationMeanM: number;
  elevationMedianM: number;
  elevationStdM: number;
  elevationReliefM: number;
  slopeMeanDeg: number;
  slopeMaxDeg: number;
  slopeDistribution: { bin: string; count: number; pct: number }[];
  roughnessTriM: number;
  localVariabilityM: number;
  tempMeanK: number | null;
  tempMinK: number | null;
  tempMaxK: number | null;
  tempStdK: number | null;
  geomorphologyClass: string;
  geologyNotes: string;
  featureSourceType: 'PARSED_RASTER_MATRIX' | 'SYNTHETIC_GEOMORPHIC_PROXY';
  cellSizeMeters: number;
  gridRows: number;
  gridCols: number;
  elevationGrid: number[][];
  slopeGrid: number[][];
  roughnessGrid: number[][];
  temperatureGrid: number[][] | null;
  missingFields: string[];
}

export interface GeographicRegion {
  id: string;
  datasetId: string;
  name: string;
  planet: PlanetId;
  countryOrQuadrangle: string;
  latitude: number;
  longitude: number;
  spatialExtentKm2: number;
  dataOrigin: DataOrigin;
  elevationDatum: string;
  summary: string;
  features: TerrainFeatureMetrics;
}

export interface SimilarityWeights {
  elevationRelief: number;
  elevationStd: number;
  slopeMean: number;
  slopeMax: number;
  roughnessTri: number;
  temperatureMean: number;
}

export type NormalizationMethod = 'minmax' | 'zscore';
export type SimilarityMetric = 'weighted_euclidean' | 'cosine';

export interface FeatureComparisonDetail {
  featureKey: string;
  label: string;
  unit: string;
  weightApplied: number;
  targetValue: number | null;
  earthValue: number | null;
  normalizedTarget: number | null;
  normalizedEarth: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  included: boolean;
  reasonIfExcluded?: string;
}

export interface SimilarityResult {
  analysisId: string;
  createdAt: string;
  targetRegionId: string;
  targetRegionName: string;
  targetPlanet: PlanetId;
  earthRegionId: string;
  earthRegionName: string;
  earthCountry: string;
  similarityScore: number;
  rawDistance: number;
  cosineScore: number;
  normalizationMethod: NormalizationMethod;
  metricUsed: SimilarityMetric;
  featureCoveragePct: number;
  featureBreakdown: FeatureComparisonDetail[];
  warnings: string[];
  explanation: string;
  methodologyNotes: string;
}

export interface AnalogSearchResponse {
  targetRegion: GeographicRegion;
  metricUsed: SimilarityMetric;
  normalizationMethod: NormalizationMethod;
  totalEarthCandidates: number;
  matches: SimilarityResult[];
  warnings: string[];
}

export interface ClusterGroup {
  clusterId: number;
  label: string;
  centroid: {
    elevationReliefM: number;
    slopeMeanDeg: number;
    roughnessTriM: number;
    elevationStdM: number;
  };
  members: {
    regionId: string;
    name: string;
    planet: PlanetId;
    distanceToCentroid: number;
  }[];
}

export interface ProcessingJob {
  id: string;
  datasetId: string;
  datasetName: string;
  status: ProcessingStatus;
  startedAt: string;
  completedAt: string | null;
  stepsCompleted: number;
  totalSteps: number;
  message: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  module: string;
  action: string;
  detail: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

export interface ReportRecord {
  id: string;
  title: string;
  createdAt: string;
  analysisId: string;
  targetRegionName: string;
  targetPlanet: PlanetId;
  earthRegionName: string;
  similarityScore: number;
  summaryText: string;
  reportPayload: {
    targetRegion: GeographicRegion;
    earthRegion: GeographicRegion;
    result: SimilarityResult;
    datasetsUsed: DatasetRecord[];
    limitations: string[];
    citations: string[];
  };
}

export interface AppSettings {
  defaultNormalization: NormalizationMethod;
  defaultMetric: SimilarityMetric;
  defaultWeights: SimilarityWeights;
  resampleGridSize: number;
  includeTemperatureWhenAvailable: boolean;
  researcherName: string;
  institutionName: string;
}

export interface DashboardSummary {
  counts: {
    totalDatasets: number;
    earthDatasets: number;
    moonDatasets: number;
    marsDatasets: number;
    processedRegions: number;
    completedComparisons: number;
    processingJobs: number;
    reportsGenerated: number;
  };
  planets: PlanetInfo[];
  recentActivities: ActivityLogEntry[];
  recentJobs: ProcessingJob[];
  recentAnalyses: SimilarityResult[];
}

export type ModuleId =
  | 'dashboard'
  | 'explorer'
  | 'comparison'
  | 'analog-finder'
  | 'data-center'
  | 'visualization'
  | 'assistant'
  | 'reports'
  | 'settings';

import {
  ClusterGroup,
  FeatureComparisonDetail,
  GeographicRegion,
  NormalizationMethod,
  SimilarityMetric,
  SimilarityResult,
  SimilarityWeights,
} from '../src/types.ts';

interface FeatureAccessor {
  key: keyof SimilarityWeights;
  label: string;
  unit: string;
  extract: (r: GeographicRegion) => number | null;
}

const FEATURE_ACCESSORS: FeatureAccessor[] = [
  {
    key: 'elevationRelief',
    label: 'Local Elevation Relief (ΔH)',
    unit: 'm',
    extract: (r) => r.features.elevationReliefM,
  },
  {
    key: 'elevationStd',
    label: 'Elevation Std. Deviation (σ)',
    unit: 'm',
    extract: (r) => r.features.elevationStdM,
  },
  {
    key: 'slopeMean',
    label: 'Mean Terrain Slope',
    unit: '°',
    extract: (r) => r.features.slopeMeanDeg,
  },
  {
    key: 'slopeMax',
    label: 'Maximum Slope',
    unit: '°',
    extract: (r) => r.features.slopeMaxDeg,
  },
  {
    key: 'roughnessTri',
    label: 'Terrain Ruggedness Index (TRI)',
    unit: 'm',
    extract: (r) => r.features.roughnessTriM,
  },
  {
    key: 'temperatureMean',
    label: 'Mean Surface Temperature',
    unit: 'K',
    extract: (r) => r.features.tempMeanK,
  },
];

interface NormStats {
  min: number;
  max: number;
  mean: number;
  std: number;
}

function computeCorpusStats(corpus: GeographicRegion[]): Record<string, NormStats> {
  const stats: Record<string, NormStats> = {};
  for (const acc of FEATURE_ACCESSORS) {
    const vals = corpus.map(acc.extract).filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length === 0) {
      stats[acc.key] = { min: 0, max: 1, mean: 0, std: 1 };
      continue;
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
    stats[acc.key] = { min, max, mean, std };
  }
  return stats;
}

function normalizeVal(val: number, stat: NormStats, method: NormalizationMethod): number {
  if (method === 'zscore') {
    // Map z-score via logistic sigmoid to [0,1] when used in cosine or keep linear for Euclidean
    return (val - stat.mean) / (stat.std || 1);
  }
  const span = stat.max - stat.min;
  return span > 0 ? (val - stat.min) / span : 0.5;
}

export function computePairwiseSimilarity(
  target: GeographicRegion,
  earth: GeographicRegion,
  corpus: GeographicRegion[],
  weights: SimilarityWeights,
  normalizationMethod: NormalizationMethod,
  metricUsed: SimilarityMetric,
  includeTemperature = true
): SimilarityResult {
  const stats = computeCorpusStats(corpus);
  const warnings: string[] = [];

  if (target.planet !== earth.planet) {
    warnings.push(
      `Cross-planetary elevation datum note: ${target.name} uses ${target.elevationDatum} while ${earth.name} uses ${earth.elevationDatum}. Absolute elevation offset is excluded; local relief (ΔH) and elevation σ are compared instead.`
    );
  }

  if (Math.abs(target.features.cellSizeMeters - earth.features.cellSizeMeters) > 100) {
    warnings.push(
      `Spatial resolution disparity: Target cell spacing (${target.features.cellSizeMeters} m) vs Earth cell spacing (${earth.features.cellSizeMeters} m). Both grids were resampled to ${target.features.gridRows}×${target.features.gridCols} for structural alignment, though sub-pixel roughness on Mars/Moon may be smoothed.`
    );
  }

  if (
    target.features.featureSourceType === 'SYNTHETIC_GEOMORPHIC_PROXY' ||
    earth.features.featureSourceType === 'SYNTHETIC_GEOMORPHIC_PROXY'
  ) {
    warnings.push(
      'One or both regions use Published Observation Reference Summaries paired with parametric geomorphic grids rather than raw downloaded PDS/SRTM GeoTIFF rasters.'
    );
  }

  const activeItems: {
    accessor: FeatureAccessor;
    rawWeight: number;
    tVal: number;
    eVal: number;
    tNorm: number;
    eNorm: number;
  }[] = [];

  const breakdown: FeatureComparisonDetail[] = [];

  for (const acc of FEATURE_ACCESSORS) {
    const rawWeight = Math.max(0, Number(weights[acc.key]) || 0);
    const tVal = acc.extract(target);
    const eVal = acc.extract(earth);

    if (acc.key === 'temperatureMean' && !includeTemperature) {
      breakdown.push({
        featureKey: acc.key,
        label: acc.label,
        unit: acc.unit,
        weightApplied: 0,
        targetValue: tVal,
        earthValue: eVal,
        normalizedTarget: null,
        normalizedEarth: null,
        absoluteDelta: tVal !== null && eVal !== null ? Number(Math.abs(tVal - eVal).toFixed(2)) : null,
        percentDelta: null,
        included: false,
        reasonIfExcluded: 'Disabled in comparison settings.',
      });
      continue;
    }

    if (rawWeight <= 0) {
      breakdown.push({
        featureKey: acc.key,
        label: acc.label,
        unit: acc.unit,
        weightApplied: 0,
        targetValue: tVal,
        earthValue: eVal,
        normalizedTarget: null,
        normalizedEarth: null,
        absoluteDelta: tVal !== null && eVal !== null ? Number(Math.abs(tVal - eVal).toFixed(2)) : null,
        percentDelta: null,
        included: false,
        reasonIfExcluded: 'Feature weight set to 0.',
      });
      continue;
    }

    if (tVal === null || eVal === null) {
      warnings.push(
        `Missing feature "${acc.label}" on ${tVal === null ? target.name : earth.name}; weight re-normalized across remaining compatible features.`
      );
      breakdown.push({
        featureKey: acc.key,
        label: acc.label,
        unit: acc.unit,
        weightApplied: 0,
        targetValue: tVal,
        earthValue: eVal,
        normalizedTarget: null,
        normalizedEarth: null,
        absoluteDelta: null,
        percentDelta: null,
        included: false,
        reasonIfExcluded: 'Measurement unavailable for one or both regions.',
      });
      continue;
    }

    const tNorm = normalizeVal(tVal, stats[acc.key], normalizationMethod);
    const eNorm = normalizeVal(eVal, stats[acc.key], normalizationMethod);
    activeItems.push({ accessor: acc, rawWeight, tVal, eVal, tNorm, eNorm });
  }

  const totalWeight = activeItems.reduce((s, x) => s + x.rawWeight, 0) || 1;
  let weightedSqDist = 0;
  let dot = 0;
  let magT = 0;
  let magE = 0;

  for (const item of activeItems) {
    const w = item.rawWeight / totalWeight;
    const diff = item.tNorm - item.eNorm;
    weightedSqDist += w * diff * diff;

    // For cosine similarity, shift z-scores slightly or use min-max values to keep positive geometric vectors
    const cT = normalizationMethod === 'zscore' ? 1 / (1 + Math.exp(-item.tNorm)) : item.tNorm;
    const cE = normalizationMethod === 'zscore' ? 1 / (1 + Math.exp(-item.eNorm)) : item.eNorm;
    dot += w * cT * cE;
    magT += w * cT * cT;
    magE += w * cE * cE;

    const absDelta = Math.abs(item.tVal - item.eVal);
    const denom = Math.max(Math.abs(item.tVal), Math.abs(item.eVal), 1e-6);
    const pctDelta = (absDelta / denom) * 100;

    breakdown.push({
      featureKey: item.accessor.key,
      label: item.accessor.label,
      unit: item.accessor.unit,
      weightApplied: Number((w * 100).toFixed(1)),
      targetValue: Number(item.tVal.toFixed(2)),
      earthValue: Number(item.eVal.toFixed(2)),
      normalizedTarget: Number(item.tNorm.toFixed(4)),
      normalizedEarth: Number(item.eNorm.toFixed(4)),
      absoluteDelta: Number(absDelta.toFixed(2)),
      percentDelta: Number(pctDelta.toFixed(1)),
      included: true,
    });
  }

  const rawDistance = Math.sqrt(weightedSqDist);
  const cosineRaw = magT > 0 && magE > 0 ? dot / (Math.sqrt(magT) * Math.sqrt(magE)) : 0;
  const cosineScore = Math.max(0, Math.min(100, cosineRaw * 100));

  // Interpretable normalized similarity index [0, 100]
  const euclideanScaleFactor = normalizationMethod === 'zscore' ? 0.85 : 2.1;
  const euclideanScore = Math.max(0, Math.min(100, 100 * Math.exp(-rawDistance * euclideanScaleFactor)));

  const similarityScore = Number(
    (metricUsed === 'cosine' ? cosineScore : euclideanScore).toFixed(2)
  );

  const includedFeatures = breakdown.filter((b) => b.included);
  const featureCoveragePct = Number(
    ((includedFeatures.length / FEATURE_ACCESSORS.length) * 100).toFixed(0)
  );

  const closest = [...includedFeatures].sort(
    (a, b) => (a.percentDelta ?? 999) - (b.percentDelta ?? 999)
  );
  const topDriver = closest[0];
  const biggestGap = closest[closest.length - 1];

  const explanation = [
    `${earth.name} (${earth.countryOrQuadrangle}) achieves a ${similarityScore.toFixed(1)}/100 normalized ${
      metricUsed === 'cosine' ? 'Cosine Similarity' : 'Weighted Euclidean Similarity'
    } index against ${target.name} (${target.planet.toUpperCase()}).`,
    topDriver
      ? `Strongest alignment is observed in ${topDriver.label} (${topDriver.targetValue} ${topDriver.unit} vs ${topDriver.earthValue} ${topDriver.unit}, Δ=${topDriver.absoluteDelta} ${topDriver.unit}).`
      : '',
    biggestGap && biggestGap.featureKey !== topDriver?.featureKey
      ? `Primary divergence occurs in ${biggestGap.label} (${biggestGap.targetValue} ${biggestGap.unit} vs ${biggestGap.earthValue} ${biggestGap.unit}).`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const methodologyNotes =
    metricUsed === 'weighted_euclidean'
      ? `Normalized feature vectors via ${
          normalizationMethod === 'minmax' ? 'Min-Max [0,1] scaling' : 'Z-Score standardization'
        } across ${corpus.length} planetary/terrestrial regions, computed Weighted Euclidean Distance d = ${rawDistance.toFixed(
          4
        )}, and mapped to an interpretable similarity index S = 100·exp(-k·d).`
      : `Normalized feature vectors via ${
          normalizationMethod === 'minmax' ? 'Min-Max [0,1] scaling' : 'Z-Score logistic projection'
        } and evaluated weighted Cosine Similarity cos(θ) = ${(cosineRaw).toFixed(4)} scaled to [0, 100].`;

  return {
    analysisId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    targetRegionId: target.id,
    targetRegionName: target.name,
    targetPlanet: target.planet,
    earthRegionId: earth.id,
    earthRegionName: earth.name,
    earthCountry: earth.countryOrQuadrangle,
    similarityScore,
    rawDistance: Number(rawDistance.toFixed(4)),
    cosineScore: Number(cosineScore.toFixed(2)),
    normalizationMethod,
    metricUsed,
    featureCoveragePct,
    featureBreakdown: breakdown,
    warnings,
    explanation,
    methodologyNotes,
  };
}

/**
 * Unsupervised K-Means clustering across all processed planetary & terrestrial regions
 * using 4 core geomorphometric dimensions: relief, elevation std, mean slope, TRI roughness.
 */
export function runKMeansClustering(regions: GeographicRegion[], k = 4): ClusterGroup[] {
  if (regions.length === 0) return [];
  const actualK = Math.min(k, regions.length);
  const stats = computeCorpusStats(regions);

  const vectors = regions.map((r) => [
    normalizeVal(r.features.elevationReliefM, stats.elevationRelief, 'minmax'),
    normalizeVal(r.features.slopeMeanDeg, stats.slopeMean, 'minmax'),
    normalizeVal(r.features.roughnessTriM, stats.roughnessTri, 'minmax'),
    normalizeVal(r.features.elevationStdM, stats.elevationStd, 'minmax'),
  ]);

  // Deterministic K-Means++ style spread initialization
  const centroids: number[][] = [vectors[0].slice()];
  while (centroids.length < actualK) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < vectors.length; i++) {
      const minD = Math.min(
        ...centroids.map((c) => c.reduce((s, val, d) => s + (val - vectors[i][d]) ** 2, 0))
      );
      if (minD > bestDist) {
        bestDist = minD;
        bestIdx = i;
      }
    }
    centroids.push(vectors[bestIdx].slice());
  }

  const assignments = new Array(regions.length).fill(0);
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < actualK; c++) {
        const d = centroids[c].reduce((s, val, dim) => s + (val - vectors[i][dim]) ** 2, 0);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }
    if (!changed) break;

    for (let c = 0; c < actualK; c++) {
      const members = vectors.filter((_, idx) => assignments[idx] === c);
      if (members.length > 0) {
        for (let dim = 0; dim < 4; dim++) {
          centroids[c][dim] = members.reduce((s, v) => s + v[dim], 0) / members.length;
        }
      }
    }
  }

  const groups: ClusterGroup[] = [];
  for (let c = 0; c < actualK; c++) {
    const memberIndices = regions
      .map((_, idx) => idx)
      .filter((idx) => assignments[idx] === c);
    if (memberIndices.length === 0) continue;

    const avgRelief =
      memberIndices.reduce((s, i) => s + regions[i].features.elevationReliefM, 0) / memberIndices.length;
    const avgSlope =
      memberIndices.reduce((s, i) => s + regions[i].features.slopeMeanDeg, 0) / memberIndices.length;
    const avgTri =
      memberIndices.reduce((s, i) => s + regions[i].features.roughnessTriM, 0) / memberIndices.length;
    const avgStd =
      memberIndices.reduce((s, i) => s + regions[i].features.elevationStdM, 0) / memberIndices.length;

    let label = 'Transitional Terrain Cluster';
    if (avgSlope < 4 && avgTri < 25) label = 'Low-Relief Plains & Basaltic Maria';
    else if (avgSlope >= 14 && avgTri >= 80) label = 'High-Relief Canyons & Fresh Crater Rims';
    else if (avgRelief > 3000 && avgSlope < 10) label = 'Broad Volcanic Shields & High Plateaus';
    else label = 'Moderate-Relief Basins & Eroded Craters';

    groups.push({
      clusterId: c + 1,
      label,
      centroid: {
        elevationReliefM: Number(avgRelief.toFixed(1)),
        slopeMeanDeg: Number(avgSlope.toFixed(2)),
        roughnessTriM: Number(avgTri.toFixed(1)),
        elevationStdM: Number(avgStd.toFixed(1)),
      },
      members: memberIndices.map((idx) => {
        const dist = Math.sqrt(
          centroids[c].reduce((s, val, dim) => s + (val - vectors[idx][dim]) ** 2, 0)
        );
        return {
          regionId: regions[idx].id,
          name: regions[idx].name,
          planet: regions[idx].planet,
          distanceToCentroid: Number(dist.toFixed(3)),
        };
      }),
    });
  }

  return groups;
}

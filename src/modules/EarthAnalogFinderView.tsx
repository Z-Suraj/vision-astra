import React, { useEffect, useMemo, useState } from 'react';
import { GitCompare, Layers, Search } from 'lucide-react';
import {
  AnalogSearchResponse,
  AppSettings,
  ClusterGroup,
  GeographicRegion,
  NormalizationMethod,
  SimilarityMetric,
  SimilarityWeights,
} from '../types';
import { ProvenanceText } from '../components/ProvenanceLabel';

interface EarthAnalogFinderViewProps {
  regions: GeographicRegion[];
  settings: AppSettings;
  onInspectComparison: (targetRegionId: string, earthRegionId: string) => void;
}

export const EarthAnalogFinderView: React.FC<EarthAnalogFinderViewProps> = ({
  regions,
  settings,
  onInspectComparison,
}) => {
  const [targetPlanet, setTargetPlanet] = useState<'mars' | 'moon'>('mars');
  const targets = useMemo(
    () => regions.filter((r) => r.planet === targetPlanet),
    [regions, targetPlanet]
  );
  const [targetId, setTargetId] = useState<string>('');
  const [metric, setMetric] = useState<SimilarityMetric>(settings.defaultMetric);
  const [normalization, setNormalization] = useState<NormalizationMethod>(settings.defaultNormalization);
  const [weights] = useState<SimilarityWeights>(settings.defaultWeights);
  const [response, setResponse] = useState<AnalogSearchResponse | null>(null);
  const [clusters, setClusters] = useState<ClusterGroup[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!targets.some((t) => t.id === targetId) && targets[0]) {
      setTargetId(targets[0].id);
    }
  }, [targets, targetId]);

  const runSearch = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/analog-finder/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRegionId: targetId,
          weights,
          normalizationMethod: normalization,
          metricUsed: metric,
          includeTemperature: settings.includeTemperatureWhenAvailable,
          limit: 10,
        }),
      });
      const data = await res.json();
      if (res.ok) setResponse(data);
    } finally {
      setLoading(false);
    }
  };

  const loadClusters = async () => {
    const res = await fetch('/api/terrain/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ k: 4 }),
    });
    if (res.ok) {
      const data = await res.json();
      setClusters(data.clusters);
    }
  };

  useEffect(() => {
    if (targetId) runSearch();
  }, [targetId, metric, normalization]);

  return (
    <div className="space-y-4">
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3 flex-1">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Planetary Body</label>
            <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md">
              {(['mars', 'moon'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTargetPlanet(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded capitalize transition-colors ${
                    targetPlanet === p
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[260px] flex-1 max-w-md">
            <label className="block text-xs text-slate-400 mb-1.5">
              Select {targetPlanet === 'mars' ? 'Martian' : 'Lunar'} Region
            </label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100"
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Scoring Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as SimilarityMetric)}
              className="px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100"
            >
              <option value="weighted_euclidean">Weighted Euclidean</option>
              <option value="cosine">Cosine Similarity</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Normalization</label>
            <select
              value={normalization}
              onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
              className="px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100"
            >
              <option value="minmax">Min-Max [0, 1]</option>
              <option value="zscore">Z-Score Standard</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={runSearch}
            disabled={loading}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{loading ? 'Ranking...' : 'Rank Earth Analogues'}</span>
          </button>
          <button
            type="button"
            onClick={loadClusters}
            className="px-3.5 py-2 bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>K-Means Clusters</span>
          </button>
        </div>
      </div>

      {/* Ranked Earth Analogues Table */}
      {response && (
        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Top {response.matches.length} Earth Terrain Analogues for {response.targetRegion.name}
              </h3>
              <div className="mt-0.5 text-xs text-slate-400">
                Evaluated {response.totalEarthCandidates} registered Earth sites ·{' '}
                <ProvenanceText origin={response.targetRegion.dataOrigin} compact />
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-800/70">
            {response.matches.map((m, idx) => {
              const reliefRow = m.featureBreakdown.find((f) => f.featureKey === 'elevationRelief');
              const slopeRow = m.featureBreakdown.find((f) => f.featureKey === 'slopeMean');
              const triRow = m.featureBreakdown.find((f) => f.featureKey === 'roughnessTri');
              const tempRow = m.featureBreakdown.find((f) => f.featureKey === 'temperatureMean');
              const earthRegion = regions.find((r) => r.id === m.earthRegionId);

              return (
                <div
                  key={m.earthRegionId}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-800/25 transition-colors"
                >
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-cyan-400 font-semibold tabular-nums">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm font-semibold text-white">{m.earthRegionName}</span>
                      <span className="text-xs text-slate-400">· {m.earthCountry}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{m.explanation}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 tabular-nums">
                      <span>ΔRelief: {reliefRow?.absoluteDelta ?? '—'} m</span>
                      <span>·</span>
                      <span>ΔSlope: {slopeRow?.absoluteDelta ?? '—'}°</span>
                      <span>·</span>
                      <span>ΔTRI: {triRow?.absoluteDelta ?? '—'} m</span>
                      <span>·</span>
                      <span>
                        ΔTemp: {tempRow?.absoluteDelta !== null && tempRow?.absoluteDelta !== undefined ? `${tempRow.absoluteDelta} K` : 'N/A'}
                      </span>
                      {earthRegion && (
                        <>
                          <span>·</span>
                          <ProvenanceText origin={earthRegion.dataOrigin} compact />
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">Similarity</div>
                      <div className="text-xl font-mono font-bold text-cyan-400 tabular-nums">
                        {m.similarityScore.toFixed(1)}
                        <span className="text-xs text-slate-500 font-normal"> / 100</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onInspectComparison(m.targetRegionId, m.earthRegionId)}
                      className="px-3 py-2 bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Compare</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional K-Means Morphological Clusters */}
      {clusters && (
        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Unsupervised K-Means Geomorphometric Clusters (k = {clusters.length})
              </h3>
              <p className="text-xs text-slate-400">
                Grouped across Earth, Moon, and Mars using normalized elevation relief, mean slope, TRI roughness, and elevation σ.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setClusters(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Hide
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusters.map((cl) => (
              <div key={cl.clusterId} className="bg-[#07090E] border border-slate-800 rounded-md p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-300">
                    Cluster {cl.clusterId}: {cl.label}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {cl.members.length} regions
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Centroid · Relief {cl.centroid.elevationReliefM} m · Slope {cl.centroid.slopeMeanDeg}° · TRI {cl.centroid.roughnessTriM} m
                </div>
                <div className="divide-y divide-slate-800/60">
                  {cl.members.map((mem) => (
                    <div key={mem.regionId} className="py-1 flex items-center justify-between text-xs">
                      <span className="text-slate-200 truncate">{mem.name}</span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0 ml-2 uppercase">
                        {mem.planet} · d={mem.distanceToCentroid}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  FileText,
  GitCompare,
  Play,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AppSettings,
  GeographicRegion,
  NormalizationMethod,
  PlanetId,
  SimilarityMetric,
  SimilarityResult,
  SimilarityWeights,
} from '../types';
import { Terrain3DViewer } from '../components/Terrain3DViewer';
import { ProvenanceText } from '../components/ProvenanceLabel';

interface TerrainComparisonViewProps {
  regions: GeographicRegion[];
  settings: AppSettings;
  initialTargetId?: string | null;
  initialEarthId?: string | null;
  onAnalysisComplete: (result: SimilarityResult) => void;
  onAskAssistant: (targetId: string, earthId: string, analysisId: string) => void;
  onGenerateReport: (analysisId: string) => void;
}

export const TerrainComparisonView: React.FC<TerrainComparisonViewProps> = ({
  regions,
  settings,
  initialTargetId,
  initialEarthId,
  onAnalysisComplete,
  onAskAssistant,
  onGenerateReport,
}) => {
  const [targetPlanet, setTargetPlanet] = useState<'mars' | 'moon'>('mars');
  const [targetId, setTargetId] = useState<string>(initialTargetId || '');
  const [earthId, setEarthId] = useState<string>(initialEarthId || '');
  const [weights, setWeights] = useState<SimilarityWeights>(settings.defaultWeights);
  const [normalization, setNormalization] = useState<NormalizationMethod>(settings.defaultNormalization);
  const [metric, setMetric] = useState<SimilarityMetric>(settings.defaultMetric);
  const [includeTemp, setIncludeTemp] = useState<boolean>(settings.includeTemperatureWhenAvailable);
  const [result, setResult] = useState<SimilarityResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planetaryTargets = useMemo(
    () => regions.filter((r) => r.planet === targetPlanet),
    [regions, targetPlanet]
  );
  const earthRegions = useMemo(
    () => regions.filter((r) => r.planet === 'earth'),
    [regions]
  );

  useEffect(() => {
    if (initialTargetId) {
      const found = regions.find((r) => r.id === initialTargetId);
      if (found && (found.planet === 'mars' || found.planet === 'moon')) {
        setTargetPlanet(found.planet);
        setTargetId(found.id);
      }
    }
  }, [initialTargetId, regions]);

  useEffect(() => {
    if (initialEarthId) {
      setEarthId(initialEarthId);
    }
  }, [initialEarthId]);

  useEffect(() => {
    if (!planetaryTargets.some((r) => r.id === targetId) && planetaryTargets[0]) {
      setTargetId(planetaryTargets[0].id);
    }
  }, [planetaryTargets, targetId]);

  useEffect(() => {
    if (!earthRegions.some((r) => r.id === earthId) && earthRegions[0]) {
      setEarthId(earthRegions[0].id);
    }
  }, [earthRegions, earthId]);

  const targetRegion = useMemo(
    () => regions.find((r) => r.id === targetId) ?? null,
    [regions, targetId]
  );
  const earthRegion = useMemo(
    () => regions.find((r) => r.id === earthId) ?? null,
    [regions, earthId]
  );

  const runComparison = async () => {
    if (!targetId || !earthId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/terrain/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRegionId: targetId,
          earthRegionId: earthId,
          weights,
          normalizationMethod: normalization,
          metricUsed: metric,
          includeTemperature: includeTemp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed.');
      setResult(data.result);
      onAnalysisComplete(data.result);
    } catch (err: any) {
      setError(err?.message || 'Comparison error');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (targetId && earthId && !result && !running) {
      runComparison();
    }
  }, [targetId, earthId]);

  const radarData = useMemo(() => {
    if (!result) return [];
    return result.featureBreakdown
      .filter((f) => f.included && f.normalizedTarget !== null && f.normalizedEarth !== null)
      .map((f) => ({
        feature: f.label.replace(' (ΔH)', '').replace(' (σ)', '').replace(' (TRI)', ''),
        target: Number(((f.normalizedTarget ?? 0) * 100).toFixed(1)),
        earth: Number(((f.normalizedEarth ?? 0) * 100).toFixed(1)),
      }));
  }, [result]);

  const weightFields: { key: keyof SimilarityWeights; label: string }[] = [
    { key: 'elevationRelief', label: 'Elevation Relief (ΔH)' },
    { key: 'elevationStd', label: 'Elevation Std Dev (σ)' },
    { key: 'slopeMean', label: 'Mean Slope (°)' },
    { key: 'slopeMax', label: 'Max Slope (°)' },
    { key: 'roughnessTri', label: 'Roughness (TRI)' },
    { key: 'temperatureMean', label: 'Surface Temperature (K)' },
  ];

  return (
    <div className="space-y-4">
      {/* Configuration Studio Bar */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs text-slate-400 mb-1.5">Target Body</label>
            <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md">
              {(['mars', 'moon'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTargetPlanet(p)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded capitalize transition-colors ${
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

          <div className="lg:col-span-4">
            <label className="block text-xs text-slate-400 mb-1.5 capitalize">
              {targetPlanet} Region
            </label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-cyan-500/60"
            >
              {planetaryTargets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.latitude.toFixed(1)}°, {r.longitude.toFixed(1)}°)
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs text-slate-400 mb-1.5">Earth Reference Region</label>
            <select
              value={earthId}
              onChange={(e) => setEarthId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-cyan-500/60"
            >
              {earthRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.countryOrQuadrangle}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              disabled={running || !targetId || !earthId}
              onClick={runComparison}
              className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{running ? 'Computing...' : 'Run Analysis'}</span>
            </button>
          </div>
        </div>

        {/* Weights & Algorithm Controls */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
          <div className="xl:col-span-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {weightFields.map((wf) => (
              <div key={wf.key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 truncate pr-1">{wf.label}</span>
                  <span className="font-mono text-cyan-400 tabular-nums">
                    {weights[wf.key].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weights[wf.key]}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [wf.key]: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            ))}
          </div>

          <div className="xl:col-span-4 flex flex-wrap items-center justify-end gap-3">
            <select
              value={normalization}
              onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
              className="px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-200"
              aria-label="Normalization Method"
            >
              <option value="minmax">Min-Max [0, 1]</option>
              <option value="zscore">Z-Score Standard</option>
            </select>

            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as SimilarityMetric)}
              className="px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-200"
              aria-label="Similarity Metric"
            >
              <option value="weighted_euclidean">Weighted Euclidean</option>
              <option value="cosine">Cosine Similarity</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={includeTemp}
                onChange={(e) => setIncludeTemp(e.target.checked)}
                className="accent-cyan-400"
              />
              <span>Thermal Band</span>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/40 rounded-lg text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Side-by-Side 3D Terrain Digital Twins */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-medium text-slate-200 capitalize">
              Target ({targetPlanet}): {targetRegion?.name}
            </span>
            {targetRegion && (
              <ProvenanceText origin={targetRegion.dataOrigin} compact />
            )}
          </div>
          <Terrain3DViewer region={targetRegion} heightClass="h-[290px]" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-medium text-slate-200">
              Earth Analogue: {earthRegion?.name}
            </span>
            {earthRegion && (
              <ProvenanceText origin={earthRegion.dataOrigin} compact />
            )}
          </div>
          <Terrain3DViewer region={earthRegion} heightClass="h-[290px]" />
        </div>
      </div>

      {/* Similarity Result & Charts */}
      {result && (
        <div className="space-y-4">
          <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800 pb-4 lg:pb-0 lg:pr-6">
              <div className="text-xs text-slate-400">Normalized Similarity Index</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold text-cyan-400 tabular-nums">
                  {result.similarityScore.toFixed(1)}
                </span>
                <span className="text-sm font-mono text-slate-500">/ 100</span>
              </div>
              <div className="mt-2 text-xs font-mono text-slate-400 tabular-nums space-y-0.5">
                <div>Euclidean Distance: {result.rawDistance.toFixed(4)}</div>
                <div>Cosine Alignment: {result.cosineScore.toFixed(1)} / 100</div>
                <div>Feature Coverage: {result.featureCoveragePct}%</div>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <GitCompare className="w-4 h-4 text-cyan-400" />
                <span>Quantitative Explanation &amp; Methodology</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{result.explanation}</p>
              <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
                {result.methodologyNotes}
              </p>
            </div>

            <div className="lg:col-span-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onAskAssistant(result.targetRegionId, result.earthRegionId, result.analysisId)}
                className="w-full px-3.5 py-2 bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Explain with AI Assistant</span>
              </button>
              <button
                type="button"
                onClick={() => onGenerateReport(result.analysisId)}
                className="w-full px-3.5 py-2 bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>Compile Research Report</span>
              </button>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3.5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Scientific Quality &amp; Datum Caveats</span>
              </div>
              <ul className="list-disc list-inside text-xs text-amber-200/80 space-y-0.5">
                {result.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Feature Breakdown Table + Radar Profile */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">Feature-Wise Comparison</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#07090E] text-slate-400 border-b border-slate-800 font-mono">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Terrain Feature</th>
                      <th className="py-2.5 px-3 font-medium text-right capitalize">{targetPlanet}</th>
                      <th className="py-2.5 px-3 font-medium text-right">Earth</th>
                      <th className="py-2.5 px-3 font-medium text-right">Δ Abs</th>
                      <th className="py-2.5 px-3 font-medium text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                    {result.featureBreakdown.map((f) => (
                      <tr key={f.featureKey} className={f.included ? '' : 'opacity-50'}>
                        <td className="py-2.5 px-3 font-sans text-slate-200">
                          <div>{f.label}</div>
                          {!f.included && f.reasonIfExcluded && (
                            <div className="text-[11px] text-amber-400">{f.reasonIfExcluded}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-100">
                          {f.targetValue !== null ? `${f.targetValue} ${f.unit}` : 'Missing'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-100">
                          {f.earthValue !== null ? `${f.earthValue} ${f.unit}` : 'Missing'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-cyan-300">
                          {f.absoluteDelta !== null ? `${f.absoluteDelta} ${f.unit}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {f.weightApplied}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="xl:col-span-5 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col">
              <div className="text-sm font-semibold text-slate-100 mb-2">
                Normalized Morphometric Profile (0–100 Scale)
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="feature" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                    <Radar
                      name={targetRegion?.name || targetPlanet}
                      dataKey="target"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.22}
                    />
                    <Radar
                      name={earthRegion?.name || 'Earth'}
                      dataKey="earth"
                      stroke="#06b6d4"
                      fill="#06b6d4"
                      fillOpacity={0.22}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f1420',
                        borderColor: '#1e293b',
                        fontSize: 11,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

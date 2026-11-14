import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { GeographicRegion } from '../types';
import { Terrain3DViewer } from '../components/Terrain3DViewer';
import { ProvenanceText } from '../components/ProvenanceLabel';

interface VisualizationLabViewProps {
  regions: GeographicRegion[];
  selectedRegionId: string | null;
  onSelectRegion: (region: GeographicRegion) => void;
}

type LayerType = 'elevation' | 'slope' | 'roughness' | 'temperature';

function colorForNormalized(t: number, layer: LayerType): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  if (layer === 'slope') {
    // Cyan -> Amber -> Crimson
    if (c < 0.5) {
      const k = c * 2;
      return [Math.round(14 + k * 231), Math.round(165 - k * 7), Math.round(233 - k * 222)];
    }
    const k = (c - 0.5) * 2;
    return [Math.round(245 - k * 6), Math.round(158 - k * 90), Math.round(11 + k * 57)];
  }
  if (layer === 'roughness') {
    // Deep slate -> Cyan -> Yellow
    if (c < 0.5) {
      const k = c * 2;
      return [Math.round(15 - k * 9), Math.round(23 + k * 159), Math.round(42 + k * 170)];
    }
    const k = (c - 0.5) * 2;
    return [Math.round(6 + k * 244), Math.round(182 + k * 22), Math.round(212 - k * 191)];
  }
  if (layer === 'temperature') {
    // Deep blue -> Cyan -> Orange-red
    if (c < 0.5) {
      const k = c * 2;
      return [Math.round(29 + k * 5), Math.round(78 + k * 133), Math.round(216 + k * 22)];
    }
    const k = (c - 0.5) * 2;
    return [Math.round(34 + k * 215), Math.round(211 - k * 96), Math.round(238 - k * 216)];
  }
  // Viridis-inspired elevation ramp
  if (c < 0.33) {
    const k = c / 0.33;
    return [Math.round(30 + k * 18), Math.round(27 + k * 77), Math.round(75 + k * 67)];
  }
  if (c < 0.66) {
    const k = (c - 0.33) / 0.33;
    return [Math.round(48 - k * 14), Math.round(104 + k * 74), Math.round(142 - k * 20)];
  }
  const k = (c - 0.66) / 0.34;
  return [Math.round(34 + k * 219), Math.round(178 + k * 53), Math.round(122 - k * 85)];
}

export const VisualizationLabView: React.FC<VisualizationLabViewProps> = ({
  regions,
  selectedRegionId,
  onSelectRegion,
}) => {
  const [layer, setLayer] = useState<LayerType>('elevation');
  const [probe, setProbe] = useState<{ row: number; col: number; value: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const region = useMemo(
    () => regions.find((r) => r.id === selectedRegionId) ?? regions[0] ?? null,
    [regions, selectedRegionId]
  );

  const activeMatrix = useMemo(() => {
    if (!region) return null;
    if (layer === 'slope') return region.features.slopeGrid;
    if (layer === 'roughness') return region.features.roughnessGrid;
    if (layer === 'temperature') return region.features.temperatureGrid;
    return region.features.elevationGrid;
  }, [region, layer]);

  const matrixStats = useMemo(() => {
    if (!activeMatrix) return { min: 0, max: 1, unit: '' };
    const flat = activeMatrix.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const unit =
      layer === 'slope' ? '°' : layer === 'temperature' ? 'K' : 'm';
    return { min, max, unit };
  }, [activeMatrix, layer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeMatrix) return;
    const rows = activeMatrix.length;
    const cols = activeMatrix[0]?.length ?? 0;
    const cellPx = 12;
    canvas.width = cols * cellPx;
    canvas.height = rows * cellPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const span = matrixStats.max - matrixStats.min || 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const norm = (activeMatrix[r][c] - matrixStats.min) / span;
        const [red, green, blue] = colorForNormalized(norm, layer);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
      }
    }
  }, [activeMatrix, matrixStats, layer]);

  const handleCanvasHover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !activeMatrix) return;
    const rect = canvas.getBoundingClientRect();
    const rows = activeMatrix.length;
    const cols = activeMatrix[0]?.length ?? 0;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * rows)));
    setProbe({ row, col, value: activeMatrix[row][col] });
  };

  const exportHeatmapPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !region) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${region.id}_${layer}_heatmap.png`;
    a.click();
  };

  const exportFeaturesCsv = () => {
    if (!region) return;
    const rows = ['row,col,elevation_m,slope_deg,roughness_tri_m,temperature_k'];
    const elev = region.features.elevationGrid;
    const slope = region.features.slopeGrid;
    const tri = region.features.roughnessGrid;
    const temp = region.features.temperatureGrid;
    for (let r = 0; r < elev.length; r++) {
      for (let c = 0; c < (elev[0]?.length ?? 0); c++) {
        rows.push(
          `${r},${c},${elev[r][c]},${slope[r]?.[c] ?? ''},${tri[r]?.[c] ?? ''},${temp?.[r]?.[c] ?? ''}`
        );
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${region.id}_terrain_grid.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scatterCorpus = useMemo(
    () =>
      regions.map((r) => ({
        name: r.name,
        planet: r.planet.toUpperCase(),
        slope: r.features.slopeMeanDeg,
        tri: r.features.roughnessTriM,
        relief: r.features.elevationReliefM,
      })),
    [regions]
  );

  if (!region) return null;

  return (
    <div className="space-y-4">
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={region.id}
            onChange={(e) => {
              const r = regions.find((item) => item.id === e.target.value);
              if (r) onSelectRegion(r);
            }}
            className="px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100 min-w-[260px]"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                [{r.planet.toUpperCase()}] {r.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md">
            {(['elevation', 'slope', 'roughness', 'temperature'] as LayerType[]).map((l) => {
              const disabled = l === 'temperature' && !region.features.temperatureGrid;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={disabled}
                  onClick={() => setLayer(l)}
                  className={`px-3 py-1.5 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                    layer === l
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : disabled
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportHeatmapPng}
            className="px-3 py-2 text-xs font-medium bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 rounded-md flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Heatmap PNG</span>
          </button>
          <button
            type="button"
            onClick={exportFeaturesCsv}
            className="px-3 py-2 text-xs font-medium bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 rounded-md flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Matrix CSV</span>
          </button>
        </div>
      </div>

      {/* Heatmap + 3D Synchronized Stage */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white capitalize">
                2D {layer} Spatial Matrix
              </h3>
              <div className="mt-0.5">
                <ProvenanceText
                  origin={region.dataOrigin}
                  sourceType={region.features.featureSourceType}
                />
              </div>
            </div>
            <div className="text-right font-mono text-xs text-cyan-300 tabular-nums">
              {probe ? `(${probe.row}, ${probe.col}) = ${probe.value.toFixed(2)} ${matrixStats.unit}` : 'Hover grid to probe'}
            </div>
          </div>

          <div className="flex justify-center bg-[#07090E] border border-slate-800 rounded p-3">
            {activeMatrix ? (
              <canvas
                ref={canvasRef}
                onMouseMove={handleCanvasHover}
                onMouseLeave={() => setProbe(null)}
                className="w-full max-w-[360px] aspect-square cursor-crosshair rounded-sm"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                Thermal layer unavailable for this dataset.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
            <span>Min: {matrixStats.min.toFixed(1)} {matrixStats.unit}</span>
            <span>Cell Spacing: {region.features.cellSizeMeters} m</span>
            <span>Max: {matrixStats.max.toFixed(1)} {matrixStats.unit}</span>
          </div>
        </div>

        <div className="xl:col-span-7">
          <Terrain3DViewer region={region} colorMode={layer} heightClass="h-[410px]" />
        </div>
      </div>

      {/* Statistical Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-100">
            Slope Angle Frequency Distribution ({region.name})
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={region.features.slopeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="bin" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f1420', borderColor: '#1e293b', fontSize: 11 }}
                />
                <Bar dataKey="pct" name="Area Share (%)" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-100">
            Cross-Planetary Slope vs. Ruggedness (TRI) Corpus
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" dataKey="slope" name="Mean Slope" unit="°" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="number" dataKey="tri" name="TRI Roughness" unit=" m" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <ZAxis type="number" dataKey="relief" range={[45, 220]} name="Relief (m)" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: '#0f1420', borderColor: '#1e293b', fontSize: 11 }}
                />
                <Scatter name="Planetary Regions" data={scatterCorpus} fill="#38bdf8" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

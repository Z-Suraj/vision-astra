import React, { useMemo, useState } from 'react';
import { GitCompare, MapPin, Search } from 'lucide-react';
import { GeographicRegion, PlanetId } from '../types';
import { PlanetaryMap2D } from '../components/PlanetaryMap2D';
import { ColorMode, Terrain3DViewer } from '../components/Terrain3DViewer';
import { ProvenanceText } from '../components/ProvenanceLabel';

interface PlanetaryExplorerViewProps {
  regions: GeographicRegion[];
  selectedPlanet: PlanetId;
  selectedRegionId: string | null;
  onSelectPlanet: (planet: PlanetId) => void;
  onSelectRegion: (region: GeographicRegion) => void;
  onSendToComparison: (region: GeographicRegion) => void;
}

export const PlanetaryExplorerView: React.FC<PlanetaryExplorerViewProps> = ({
  regions,
  selectedPlanet,
  selectedRegionId,
  onSelectPlanet,
  onSelectRegion,
  onSendToComparison,
}) => {
  const [viewMode, setViewMode] = useState<'split' | '2d' | '3d'>('split');
  const [colorMode, setColorMode] = useState<ColorMode>('elevation');
  const [coordQuery, setCoordQuery] = useState('');

  const planetRegions = useMemo(
    () => regions.filter((r) => r.planet === selectedPlanet),
    [regions, selectedPlanet]
  );

  const activeRegion = useMemo(
    () =>
      planetRegions.find((r) => r.id === selectedRegionId) ??
      planetRegions[0] ??
      null,
    [planetRegions, selectedRegionId]
  );

  const handleCoordSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = coordQuery
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (parts.length < 2 || planetRegions.length === 0) return;
    const [targetLat, targetLon] = parts;
    let nearest = planetRegions[0];
    let bestDist = Infinity;
    for (const r of planetRegions) {
      const d = (r.latitude - targetLat) ** 2 + (r.longitude - targetLon) ** 2;
      if (d < bestDist) {
        bestDist = d;
        nearest = r;
      }
    }
    onSelectRegion(nearest);
  };

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md">
            {(['mars', 'moon', 'earth'] as PlanetId[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onSelectPlanet(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors capitalize whitespace-nowrap ${
                  selectedPlanet === p
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md">
            {([
              { id: 'split', label: '2D + 3D Split' },
              { id: '2d', label: '2D Map' },
              { id: '3d', label: '3D Terrain' },
            ] as const).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  viewMode === m.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleCoordSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={coordQuery}
              onChange={(e) => setCoordQuery(e.target.value)}
              placeholder="Lat, Lon (e.g. 18.4, 77.6)"
              className="pl-8 pr-3 py-1.5 w-48 text-xs font-mono bg-[#07090E] border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors whitespace-nowrap"
          >
            Locate Nearest
          </button>
        </form>
      </div>

      {/* Main Explorer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Region Selector List */}
        <div className="lg:col-span-3 bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden flex flex-col max-h-[540px]">
          <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 capitalize">
              {selectedPlanet} Regions ({planetRegions.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
            {planetRegions.map((r) => {
              const selected = activeRegion?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectRegion(r)}
                  className={`w-full text-left px-3.5 py-3 transition-colors ${
                    selected ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-medium ${selected ? 'text-cyan-300' : 'text-slate-200'}`}>
                      {r.name}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-slate-400 tabular-nums">
                    {r.latitude.toFixed(2)}°, {r.longitude.toFixed(2)}° · ΔH {r.features.elevationReliefM} m
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                    {r.features.geomorphologyClass}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive 2D/3D Canvas Stage */}
        <div className="lg:col-span-9 space-y-4">
          <div
            className={`grid gap-4 ${
              viewMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {(viewMode === 'split' || viewMode === '2d') && (
              <PlanetaryMap2D
                planet={selectedPlanet}
                regions={regions}
                selectedRegionId={activeRegion?.id ?? null}
                onSelectRegion={onSelectRegion}
                heightClass="h-[390px]"
              />
            )}
            {(viewMode === 'split' || viewMode === '3d') && (
              <Terrain3DViewer
                region={activeRegion}
                colorMode={colorMode}
                heightClass="h-[348px]"
              />
            )}
          </div>

          {/* Selected Region Telemetry Bar */}
          {activeRegion && (
            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                    <h3 className="text-base font-display font-semibold text-white">
                      {activeRegion.name}
                    </h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{activeRegion.countryOrQuadrangle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeRegion.latitude.toFixed(3)}°, {activeRegion.longitude.toFixed(3)}°
                    </span>
                    <span aria-hidden="true">·</span>
                    <ProvenanceText
                      origin={activeRegion.dataOrigin}
                      sourceType={activeRegion.features.featureSourceType}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSendToComparison(activeRegion)}
                  className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium text-xs rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Analyze in Comparison Studio</span>
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{activeRegion.summary}</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-slate-800/80">
                <div>
                  <div className="text-[11px] text-slate-500">Min / Max Elev</div>
                  <div className="text-xs font-mono text-slate-100 tabular-nums mt-0.5">
                    {activeRegion.features.elevationMinM} / {activeRegion.features.elevationMaxM} m
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Local Relief (ΔH)</div>
                  <div className="text-xs font-mono text-cyan-300 tabular-nums mt-0.5">
                    {activeRegion.features.elevationReliefM} m
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Mean / Max Slope</div>
                  <div className="text-xs font-mono text-slate-100 tabular-nums mt-0.5">
                    {activeRegion.features.slopeMeanDeg}° / {activeRegion.features.slopeMaxDeg}°
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Ruggedness (TRI)</div>
                  <div className="text-xs font-mono text-slate-100 tabular-nums mt-0.5">
                    {activeRegion.features.roughnessTriM} m
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Mean Surface Temp</div>
                  <div className="text-xs font-mono text-slate-100 tabular-nums mt-0.5">
                    {activeRegion.features.tempMeanK !== null
                      ? `${activeRegion.features.tempMeanK} K`
                      : 'Unavailable'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Elevation Datum</div>
                  <div className="text-[11px] font-mono text-slate-300 truncate mt-0.5" title={activeRegion.elevationDatum}>
                    {activeRegion.elevationDatum}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

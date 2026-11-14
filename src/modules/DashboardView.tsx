import React from 'react';
import {
  ArrowRight,
  Database,
  GitCompare,
  Globe2,
  Layers,
  Search,
  Upload,
} from 'lucide-react';
import { DashboardSummary, DatasetRecord, ModuleId, PlanetId } from '../types';
import { formatOriginLabel } from '../components/ProvenanceLabel';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  datasets: DatasetRecord[];
  loading: boolean;
  onNavigate: (module: ModuleId) => void;
  onExplorePlanet: (planet: PlanetId) => void;
  onLoadQuickSample: () => void;
}

const PLANET_IMAGES: Record<PlanetId, string> = {
  mars: '/src/assets/images/planet_mars_orbital_1794633132800.jpg',
  moon: '/src/assets/images/planet_moon_orbital_1794633133874.jpg',
  earth: '/src/assets/images/planet_earth_orbital_1794633134064.jpg',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  datasets,
  loading,
  onNavigate,
  onExplorePlanet,
  onLoadQuickSample,
}) => {
  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#0B0E17] border border-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-[#0B0E17] border border-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const counts = summary?.counts ?? {
    totalDatasets: 0,
    earthDatasets: 0,
    moonDatasets: 0,
    marsDatasets: 0,
    processedRegions: 0,
    completedComparisons: 0,
    processingJobs: 0,
    reportsGenerated: 0,
  };

  return (
    <div className="space-y-6">
      {/* Hero Mission Brief */}
      <section className="bg-[#0B0E17] border border-slate-800 rounded-lg p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-3xl">
          <div className="text-xs font-mono text-cyan-400">
            Earth–Moon–Mars Terrain Intelligence &amp; Digital Twin Platform
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight text-balance">
            Understanding Planetary Landscapes Through Quantitative Terrain Analysis
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ingest elevation rasters (GeoTIFF, CSV, GeoJSON, PDS IMG), extract slope and Terrain Ruggedness Index (TRI)
            features, and rank terrestrial planetary analogues using interpretable similarity metrics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('comparison')}
            className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium text-xs rounded-md transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <GitCompare className="w-4 h-4" />
            <span>Compare Planetary Terrain</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('data-center')}
            className="px-4 py-2.5 bg-[#07090E] hover:bg-slate-900 text-slate-200 border border-slate-700 font-medium text-xs rounded-md transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Elevation Dataset</span>
          </button>
        </div>
      </section>

      {/* Primary Telemetry KPI Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Registered Datasets</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-white tabular-nums">
            {counts.totalDatasets}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
            Earth {counts.earthDatasets} · Mars {counts.marsDatasets} · Moon {counts.moonDatasets}
          </div>
        </div>

        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Processed Terrain Regions</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-white tabular-nums">
            {counts.processedRegions}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500">
            Elevation, slope &amp; TRI indexed
          </div>
        </div>

        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Completed Comparisons</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-cyan-400 tabular-nums">
            {counts.completedComparisons}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500">
            Reports generated: {counts.reportsGenerated}
          </div>
        </div>

        <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Geospatial Pipeline Jobs</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-white tabular-nums">
            {counts.processingJobs}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500">
            Active &amp; historical runs
          </div>
        </div>
      </section>

      {/* Planetary Overview Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Planetary Terrain Domains</h3>
          <button
            type="button"
            onClick={() => onNavigate('analog-finder')}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 whitespace-nowrap"
          >
            <span>Find Earth Analogues</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(summary?.planets ?? []).map((planet) => {
            const dsCount = datasets.filter((d) => d.planet === planet.id).length;
            return (
              <div
                key={planet.id}
                className="bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden flex flex-col"
              >
                <div className="relative h-40 bg-[#07090E] overflow-hidden">
                  <img
                    src={PLANET_IMAGES[planet.id]}
                    alt={`${planet.name} orbital planetary surface terrain`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E17] via-black/30 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <div>
                      <div className="text-lg font-display font-semibold text-white">
                        {planet.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                        R = {planet.radiusKm.toLocaleString()} km · g = {planet.gravityMs2} m/s²
                      </div>
                    </div>
                    <span className="text-xs font-mono text-cyan-300 tabular-nums">
                      {dsCount} {dsCount === 1 ? 'dataset' : 'datasets'}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 leading-relaxed">
                      {planet.description}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      Datum: {planet.elevationDatum}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400 truncate">
                      {planet.primaryDatasets.join(' · ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onExplorePlanet(planet.id)}
                      className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 shrink-0 ml-2 whitespace-nowrap"
                    >
                      <Globe2 className="w-3.5 h-3.5" />
                      <span>Explore</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dataset Availability & Recent Activity Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-100">Dataset Availability &amp; Provenance</h3>
            </div>
            <button
              type="button"
              onClick={onLoadQuickSample}
              className="px-2.5 py-1 text-xs font-medium text-amber-300 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors whitespace-nowrap"
            >
              Load Mars Sample Grid (Demo)
            </button>
          </div>
          <div className="divide-y divide-slate-800/70">
            {datasets.slice(0, 6).map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-100 truncate">{d.name}</div>
                  <div className="mt-0.5 text-[11px] font-mono text-slate-400 truncate">
                    {d.planet.toUpperCase()} · {d.instrument} · {d.spatialResolution} · {formatOriginLabel(d.dataOrigin)}
                  </div>
                </div>
                <span
                  className={`text-[11px] font-mono shrink-0 capitalize ${
                    d.processingStatus === 'completed'
                      ? 'text-emerald-400'
                      : d.processingStatus === 'failed'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {d.processingStatus}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-100">Recent Scientific Activity</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
            >
              View Reports
            </button>
          </div>
          <div className="divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
            {(summary?.recentActivities ?? []).length === 0 ? (
              <div className="p-4 text-xs text-slate-500">No activity recorded yet.</div>
            ) : (
              summary?.recentActivities.slice(0, 7).map((act) => (
                <div key={act.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200">{act.action}</span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {new Date(act.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400 leading-snug">{act.detail}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

import React, { useState } from 'react';
import { Check, Save } from 'lucide-react';
import { AppSettings, NormalizationMethod, SimilarityMetric, SimilarityWeights } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (updated: AppSettings) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await onSaveSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const weightKeys: { key: keyof SimilarityWeights; label: string }[] = [
    { key: 'elevationRelief', label: 'Elevation Relief (ΔH)' },
    { key: 'elevationStd', label: 'Elevation Std Dev (σ)' },
    { key: 'slopeMean', label: 'Mean Slope (°)' },
    { key: 'slopeMax', label: 'Max Slope (°)' },
    { key: 'roughnessTri', label: 'Ruggedness (TRI)' },
    { key: 'temperatureMean', label: 'Mean Temperature (K)' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <form onSubmit={handleSave} className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-5">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-base font-display font-semibold text-white">
            Researcher Preferences &amp; Similarity Defaults
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure default normalization, similarity metrics, resampling grid dimensions, and researcher attribution.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Researcher Name</label>
            <input
              type="text"
              value={form.researcherName}
              onChange={(e) => setForm({ ...form, researcherName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Institution / Laboratory</label>
            <input
              type="text"
              value={form.institutionName}
              onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Default Normalization Method</label>
            <select
              value={form.defaultNormalization}
              onChange={(e) =>
                setForm({ ...form, defaultNormalization: e.target.value as NormalizationMethod })
              }
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            >
              <option value="minmax">Min-Max [0, 1] Scaling</option>
              <option value="zscore">Z-Score Standardization</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Default Similarity Algorithm</label>
            <select
              value={form.defaultMetric}
              onChange={(e) =>
                setForm({ ...form, defaultMetric: e.target.value as SimilarityMetric })
              }
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            >
              <option value="weighted_euclidean">Weighted Euclidean Distance</option>
              <option value="cosine">Cosine Similarity</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Standardized Resampling Grid Size (N×N)
            </label>
            <select
              value={form.resampleGridSize}
              onChange={(e) => setForm({ ...form, resampleGridSize: Number(e.target.value) })}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            >
              <option value={24}>24 × 24 (Fast)</option>
              <option value={32}>32 × 32 (Balanced Standard)</option>
              <option value={48}>48 × 48 (High Resolution)</option>
            </select>
          </div>

          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.includeTemperatureWhenAvailable}
                onChange={(e) =>
                  setForm({ ...form, includeTemperatureWhenAvailable: e.target.checked })
                }
                className="accent-cyan-400"
              />
              <span>Include Surface Temperature (K) when both regions have thermal observations</span>
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="text-xs font-semibold text-slate-200">Default Feature Weights</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {weightKeys.map((wk) => (
              <div key={wk.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{wk.label}</span>
                  <span className="font-mono text-cyan-400 tabular-nums">
                    {form.defaultWeights[wk.key].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.defaultWeights[wk.key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultWeights: {
                        ...form.defaultWeights,
                        [wk.key]: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          {saved && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Settings saved
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>

      {/* Architecture & Deployment Reference */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-base font-display font-semibold text-white">
          System Architecture &amp; External Infrastructure Documentation
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="bg-[#07090E] border border-slate-800 rounded p-4 space-y-1.5">
            <div className="font-semibold text-cyan-300">Active Sandbox Runtime</div>
            <p className="text-slate-400 leading-relaxed">
              Persistence uses SQLite (<code className="font-mono text-slate-200">better-sqlite3</code>) in{' '}
              <code className="font-mono text-slate-200">./data/vision_astraa.db</code>. Geospatial raster ingestion
              (GeoTIFF via <code className="font-mono text-slate-200">geotiff.js</code>, CSV, GeoJSON, PDS IMG) and
              Horn slope / Riley TRI feature extraction execute directly on the Node.js Express backend.
            </p>
          </div>
          <div className="bg-[#07090E] border border-slate-800 rounded p-4 space-y-1.5">
            <div className="font-semibold text-cyan-300">Production Scale-Out Blueprints</div>
            <p className="text-slate-400 leading-relaxed">
              For multi-gigabyte PDS IMG/GeoTIFF reprojection and spatial indexing, deploy the included{' '}
              <code className="font-mono text-slate-200">python_service/processor.py</code> (FastAPI + Rasterio/GDAL/NumPy)
              and apply <code className="font-mono text-slate-200">docs/schema.postgis.sql</code> on PostgreSQL + PostGIS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileUp,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import {
  DatasetCategory,
  DatasetRecord,
  PlanetId,
  ProcessingJob,
} from '../types';
import { ProvenanceText } from '../components/ProvenanceLabel';

interface DataCenterViewProps {
  datasets: DatasetRecord[];
  jobs: ProcessingJob[];
  onRefresh: () => Promise<void>;
}

const CATEGORIES: { id: 'all' | DatasetCategory; label: string }[] = [
  { id: 'all', label: 'All Categories' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'slope', label: 'Slope' },
  { id: 'roughness', label: 'Roughness' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'imagery', label: 'Imagery' },
  { id: 'geology', label: 'Geology' },
];

export const DataCenterView: React.FC<DataCenterViewProps> = ({
  datasets,
  jobs,
  onRefresh,
}) => {
  const [planetFilter, setPlanetFilter] = useState<'all' | PlanetId>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DatasetCategory>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [inspectDataset, setInspectDataset] = useState<DatasetRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DatasetRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [planet, setPlanet] = useState<PlanetId>('mars');
  const [category, setCategory] = useState<DatasetCategory>('elevation');
  const [instrument, setInstrument] = useState('');
  const [provider, setProvider] = useState('');
  const [doi, setDoi] = useState('');
  const [regionName, setRegionName] = useState('');
  const [latitude, setLatitude] = useState('18.38');
  const [longitude, setLongitude] = useState('77.58');
  const [autoProcess, setAutoProcess] = useState(true);
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(() => {
    return datasets.filter((d) => {
      if (planetFilter !== 'all' && d.planet !== planetFilter) return false;
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      return true;
    });
  }, [datasets, planetFilter, categoryFilter]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatusMessage({ type: 'err', text: 'Select a GeoTIFF, CSV, GeoJSON, or PDS IMG file first.' });
      return;
    }
    setUploading(true);
    setStatusMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name || file.name);
      form.append('planet', planet);
      form.append('category', category);
      form.append('instrument', instrument || 'User Geospatial Sensor');
      form.append('provider', provider || 'Direct Upload');
      form.append('doiOrIdentifier', doi);
      form.append('regionName', regionName || name || file.name);
      form.append('latitude', latitude);
      form.append('longitude', longitude);
      form.append('autoProcess', String(autoProcess));

      const res = await fetch('/api/datasets/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setStatusMessage({
        type: 'ok',
        text: `Registered "${data.dataset.name}"${autoProcess ? ' and completed geospatial feature extraction.' : '.'}`,
      });
      setShowUpload(false);
      setFile(null);
      setName('');
      await onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Upload error' });
    } finally {
      setUploading(false);
    }
  };

  const handleLoadSample = async (sampleType: 'mars_crater' | 'moon_rim' | 'earth_basin') => {
    setBusyId(sampleType);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/datasets/load-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sample.');
      setStatusMessage({
        type: 'ok',
        text: `Ingested and processed demonstration grid "${data.dataset.name}".`,
      });
      await onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Sample load error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleProcess = async (ds: DatasetRecord) => {
    setBusyId(ds.id);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/datasets/${ds.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed.');
      setStatusMessage({ type: 'ok', text: `Processed features for "${ds.name}".` });
      await onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Processing failed' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const res = await fetch(`/api/datasets/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Delete failed');
      }
      setStatusMessage({ type: 'ok', text: `Deleted dataset "${deleteTarget.name}".` });
      if (inspectDataset?.id === deleteTarget.id) setInspectDataset(null);
      setDeleteTarget(null);
      await onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Delete error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action & Filter Bar */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md">
            {(['all', 'mars', 'moon', 'earth'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlanetFilter(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                  planetFilter === p
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {p === 'all' ? 'All Planets' : p}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | DatasetCategory)}
            className="px-3 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-200"
            aria-label="Filter by dataset category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/datasets/sample-template/mars_crater"
            download
            className="px-3 py-2 text-xs font-medium bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-300 rounded-md flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Sample Mars CSV</span>
          </a>
          <button
            type="button"
            disabled={busyId === 'mars_crater'}
            onClick={() => handleLoadSample('mars_crater')}
            className="px-3 py-2 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-md transition-colors whitespace-nowrap"
          >
            {busyId === 'mars_crater' ? 'Ingesting...' : 'Ingest Mars Demo Grid'}
          </button>
          <button
            type="button"
            disabled={busyId === 'moon_rim'}
            onClick={() => handleLoadSample('moon_rim')}
            className="px-3 py-2 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-md transition-colors whitespace-nowrap"
          >
            {busyId === 'moon_rim' ? 'Ingesting...' : 'Ingest Moon Demo Grid'}
          </button>
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="px-4 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Upload Dataset</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            statusMessage.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-current opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Upload Form Panel */}
      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="bg-[#0B0E17] border border-cyan-500/40 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Ingest Scientific Geospatial Dataset
              </h3>
              <p className="text-xs text-slate-400">
                Supported formats: GeoTIFF (.tif/.tiff), CSV elevation grids/tables, GeoJSON/JSON, and raw PDS binary (.img).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Raster / Tabular File *</label>
              <input
                type="file"
                accept=".tif,.tiff,.csv,.txt,.json,.geojson,.img,.bin"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-cyan-300 hover:file:bg-slate-700"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Dataset Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MOLA Jezero Tile 04"
                className="w-full px-3 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Target Planet &amp; Category</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={planet}
                  onChange={(e) => setPlanet(e.target.value as PlanetId)}
                  className="px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
                >
                  <option value="mars">Mars</option>
                  <option value="moon">Moon</option>
                  <option value="earth">Earth</option>
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DatasetCategory)}
                  className="px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
                >
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Scientific Instrument</label>
              <input
                type="text"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                placeholder="e.g. MOLA / HiRISE / SRTM"
                className="w-full px-3 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Data Provider &amp; DOI</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="NASA PDS / USGS"
                  className="px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
                />
                <input
                  type="text"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                  placeholder="DOI / ID"
                  className="px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Region Name &amp; Center (Lat, Lon)</label>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="text"
                  value={regionName}
                  onChange={(e) => setRegionName(e.target.value)}
                  placeholder="Region label"
                  className="px-2 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
                />
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Lat"
                  className="px-2 py-1.5 text-xs font-mono bg-[#07090E] border border-slate-800 rounded text-slate-100"
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Lon"
                  className="px-2 py-1.5 text-xs font-mono bg-[#07090E] border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoProcess}
                onChange={(e) => setAutoProcess(e.target.checked)}
                className="accent-cyan-400"
              />
              <span>Automatically execute 4-stage geospatial feature extraction after upload</span>
            </label>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-md transition-colors"
            >
              {uploading ? 'Uploading & Processing...' : 'Ingest Dataset'}
            </button>
          </div>
        </form>
      )}

      {/* Dataset Registry Table */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Dataset Provenance Registry ({filtered.length})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#07090E] border-b border-slate-800 text-slate-400 font-mono">
              <tr>
                <th className="py-2.5 px-3 font-medium">Dataset Name &amp; ID</th>
                <th className="py-2.5 px-3 font-medium">Planet · Category</th>
                <th className="py-2.5 px-3 font-medium">Instrument &amp; Provider</th>
                <th className="py-2.5 px-3 font-medium">Resolution · CRS</th>
                <th className="py-2.5 px-3 font-medium">Provenance &amp; Status</th>
                <th className="py-2.5 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-slate-800/25">
                  <td className="py-3 px-3 max-w-[260px]">
                    <div className="font-medium text-slate-100 truncate">{d.name}</div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">
                      {d.id} · DOI: {d.doiOrIdentifier}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300 capitalize whitespace-nowrap">
                    {d.planet} · {d.category}
                  </td>
                  <td className="py-3 px-3 max-w-[220px]">
                    <div className="text-slate-200 truncate">{d.instrument}</div>
                    <div className="text-[11px] text-slate-400 truncate">{d.provider}</div>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-300 max-w-[190px]">
                    <div className="truncate">{d.spatialResolution}</div>
                    <div className="text-slate-500 truncate">{d.crs}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div>
                      <ProvenanceText origin={d.dataOrigin} compact />
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] capitalize text-slate-400">
                      Pipeline: {d.processingStatus} · {d.downloadDate}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setInspectDataset(d)}
                        className="p-1.5 text-slate-300 hover:text-cyan-300 border border-slate-800 rounded transition-colors"
                        title="Inspect Metadata & History"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {d.dataOrigin !== 'OBSERVATION_REFERENCE' && (
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => handleProcess(d)}
                          className="p-1.5 text-cyan-300 hover:text-cyan-200 border border-slate-800 rounded transition-colors disabled:opacity-50"
                          title="Run Geospatial Feature Extraction"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(d)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 border border-slate-800 rounded transition-colors"
                        title="Delete Dataset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Processing Jobs History */}
      <div className="bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">
            Geospatial Processing Pipeline Jobs ({jobs.length})
          </h3>
        </div>
        {jobs.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">
            No user raster processing jobs executed yet. Upload a GeoTIFF/CSV or click "Ingest Mars Demo Grid" to run the 4-stage pipeline.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {jobs.slice(0, 8).map((j) => (
              <div key={j.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-200 truncate">{j.datasetName}</div>
                  <div className="text-slate-400 text-[11px] truncate">{j.message}</div>
                </div>
                <div className="font-mono text-[11px] shrink-0 text-right tabular-nums">
                  <div className={j.status === 'completed' ? 'text-emerald-400' : j.status === 'failed' ? 'text-rose-400' : 'text-cyan-400'}>
                    {j.status.toUpperCase()} ({j.stepsCompleted}/{j.totalSteps})
                  </div>
                  <div className="text-slate-500">{new Date(j.startedAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata & Processing History Inspector Modal */}
      {inspectDataset && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#0B0E17] border border-slate-700 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-display font-semibold text-white">
                  {inspectDataset.name}
                </h3>
                <div className="mt-1">
                  <ProvenanceText origin={inspectDataset.dataOrigin} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectDataset(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Dataset ID</div>
                <div className="font-mono text-slate-200">{inspectDataset.id}</div>
              </div>
              <div>
                <div className="text-slate-500">DOI / Identifier</div>
                <div className="font-mono text-slate-200">{inspectDataset.doiOrIdentifier}</div>
              </div>
              <div>
                <div className="text-slate-500">Instrument</div>
                <div className="text-slate-200">{inspectDataset.instrument}</div>
              </div>
              <div>
                <div className="text-slate-500">Data Provider</div>
                <div className="text-slate-200">{inspectDataset.provider}</div>
              </div>
              <div>
                <div className="text-slate-500">Spatial Resolution &amp; Units</div>
                <div className="font-mono text-slate-200">
                  {inspectDataset.spatialResolution} · {inspectDataset.units}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Coordinate Reference System</div>
                <div className="font-mono text-slate-200">{inspectDataset.crs}</div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-500">Source URL</div>
                {inspectDataset.sourceUrl.startsWith('http') ? (
                  <a
                    href={inspectDataset.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-cyan-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>{inspectDataset.sourceUrl}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <div className="font-mono text-slate-300">{inspectDataset.sourceUrl}</div>
                )}
              </div>
              <div className="col-span-2">
                <div className="text-slate-500">Notes</div>
                <div className="text-slate-300 leading-relaxed">{inspectDataset.notes}</div>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-200">Processing History</div>
              <div className="space-y-2">
                {inspectDataset.processingHistory.map((h, i) => (
                  <div key={i} className="bg-[#07090E] border border-slate-800 rounded p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                        {h.step}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {new Date(h.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-400">{h.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#0B0E17] border border-slate-700 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Confirm Dataset Deletion</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Delete <span className="font-semibold text-white">{deleteTarget.name}</span> and all derived region
              terrain features? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 text-xs text-slate-300 border border-slate-700 rounded hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={handleDelete}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded"
              >
                {busyId === deleteTarget.id ? 'Deleting...' : 'Delete Dataset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

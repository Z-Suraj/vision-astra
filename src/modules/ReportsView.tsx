import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, FileText, Plus } from 'lucide-react';
import { ReportRecord, SimilarityResult } from '../types';
import { formatOriginLabel } from '../components/ProvenanceLabel';

interface ReportsViewProps {
  reports: ReportRecord[];
  analyses: SimilarityResult[];
  initialAnalysisId?: string | null;
  onRefresh: () => Promise<void>;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  reports,
  analyses,
  initialAnalysisId,
  onRefresh,
}) => {
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>(
    initialAnalysisId || analyses[0]?.analysisId || ''
  );
  const [customTitle, setCustomTitle] = useState('');
  const [activeReport, setActiveReport] = useState<ReportRecord | null>(reports[0] ?? null);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compileReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnalysisId) return;
    setCompiling(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: selectedAnalysisId,
          title: customTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to compile report.');
      setActiveReport(data);
      setCustomTitle('');
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Compilation error');
    } finally {
      setCompiling(false);
    }
  };

  const downloadCsv = (report: ReportRecord) => {
    const { result, targetRegion, earthRegion } = report.reportPayload;
    const rows = [
      ['Report Title', report.title],
      ['Generated At', report.createdAt],
      ['Disclaimer', 'Exploratory geospatial analog analysis - not peer-reviewed scientific conclusions'],
      ['Target Region', `${targetRegion.name} (${targetRegion.planet.toUpperCase()})`],
      ['Target Provenance', formatOriginLabel(targetRegion.dataOrigin)],
      ['Earth Region', `${earthRegion.name} (${earthRegion.countryOrQuadrangle})`],
      ['Earth Provenance', formatOriginLabel(earthRegion.dataOrigin)],
      ['Similarity Score', `${result.similarityScore} / 100`],
      ['Metric Used', result.metricUsed],
      ['Normalization', result.normalizationMethod],
      [],
      ['Feature', 'Unit', 'Target Value', 'Earth Value', 'Absolute Delta', 'Weight (%)', 'Included'],
      ...result.featureBreakdown.map((f) => [
        f.label,
        f.unit,
        f.targetValue ?? 'N/A',
        f.earthValue ?? 'N/A',
        f.absoluteDelta ?? 'N/A',
        f.weightApplied,
        f.included ? 'Yes' : `No (${f.reasonIfExcluded})`,
      ]),
    ];

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = (report: ReportRecord) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const { targetRegion, earthRegion, result, datasetsUsed, limitations, citations } =
      report.reportPayload;

    let y = 48;
    const lineHeight = 15;
    const margin = 44;
    const maxWidth = 507;

    const addText = (text: string, size = 10, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        if (y > 780) {
          doc.addPage();
          y = 48;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
    };

    addText('VISION ASTRAA — SCIENTIFIC TERRAIN ANALOG REPORT', 14, true);
    y += 4;
    addText(report.title, 12, true);
    addText(`Generated: ${new Date(report.createdAt).toUTCString()} · Report ID: ${report.id}`, 9);
    y += 8;

    addText('1. EXPLORATORY ANALYSIS NOTICE', 11, true);
    addText(
      'This document reports exploratory geospatial terrain similarity calculations and does not represent peer-reviewed scientific validation.',
      9
    );
    y += 8;

    addText('2. SELECTED REGIONS & DATA PROVENANCE', 11, true);
    addText(
      `Target Region: ${targetRegion.name} (${targetRegion.planet.toUpperCase()}) · Lat ${targetRegion.latitude}°, Lon ${targetRegion.longitude}° · Datum: ${targetRegion.elevationDatum} · Origin: ${formatOriginLabel(targetRegion.dataOrigin)}`,
      9
    );
    addText(
      `Earth Reference: ${earthRegion.name} (${earthRegion.countryOrQuadrangle}) · Lat ${earthRegion.latitude}°, Lon ${earthRegion.longitude}° · Datum: ${earthRegion.elevationDatum} · Origin: ${formatOriginLabel(earthRegion.dataOrigin)}`,
      9
    );
    y += 8;

    addText('3. SIMILARITY METHODOLOGY & OVERALL SCORE', 11, true);
    addText(`Similarity Index: ${result.similarityScore.toFixed(2)} / 100`, 10, true);
    addText(result.methodologyNotes, 9);
    addText(result.explanation, 9);
    y += 8;

    addText('4. FEATURE EXTRACTION & STATISTICAL COMPARISON', 11, true);
    addText(
      'Slope derived via Horn 3x3 finite-difference gradient; roughness derived via Riley Terrain Ruggedness Index (TRI).',
      9
    );
    for (const f of result.featureBreakdown) {
      addText(
        `• ${f.label}: Target = ${f.targetValue ?? 'N/A'} ${f.unit} | Earth = ${f.earthValue ?? 'N/A'} ${f.unit} | Δ = ${f.absoluteDelta ?? 'N/A'} ${f.unit} | Weight = ${f.weightApplied}%`,
        9
      );
    }
    y += 8;

    addText('5. LIMITATIONS & QUALITY WARNINGS', 11, true);
    for (const lim of limitations) {
      addText(`• ${lim}`, 9);
    }
    y += 8;

    addText('6. DATA SOURCES, METADATA & CITATIONS', 11, true);
    for (const d of datasetsUsed) {
      addText(`• ${d.name} (${d.instrument}, ${d.spatialResolution}, CRS: ${d.crs})`, 9);
    }
    for (const c of citations) {
      addText(`• ${c}`, 8);
    }

    doc.save(`${report.id}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Compile New Report Form */}
      <form
        onSubmit={compileReport}
        className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
      >
        <div className="lg:col-span-5">
          <label className="block text-xs text-slate-400 mb-1">
            Source Similarity Analysis
          </label>
          <select
            value={selectedAnalysisId}
            onChange={(e) => setSelectedAnalysisId(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100"
          >
            {analyses.length === 0 ? (
              <option value="">No completed analyses yet — run Terrain Comparison first</option>
            ) : (
              analyses.map((a) => (
                <option key={a.analysisId} value={a.analysisId}>
                  {a.targetRegionName} ({a.targetPlanet.toUpperCase()}) vs {a.earthRegionName} — {a.similarityScore.toFixed(1)}/100
                </option>
              ))
            )}
          </select>
        </div>

        <div className="lg:col-span-5">
          <label className="block text-xs text-slate-400 mb-1">Report Title (Optional)</label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="e.g. Jezero Crater vs Atacama Basin Geomorphometric Evaluation"
            className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={compiling || !selectedAnalysisId}
            className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{compiling ? 'Compiling...' : 'Generate Report'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Report List + Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold text-slate-100">
            Compiled Reports ({reports.length})
          </div>
          {reports.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              No reports compiled yet. Select an analysis above and click Generate Report.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {reports.map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setActiveReport(rep)}
                  className={`w-full text-left p-3.5 transition-colors ${
                    activeReport?.id === rep.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/35'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-100 line-clamp-2">{rep.title}</div>
                  <div className="mt-1 text-[11px] font-mono text-slate-400 tabular-nums">
                    Score: {rep.similarityScore.toFixed(1)}/100 · {new Date(rep.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {activeReport ? (
            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-amber-300">
                    Exploratory Scientific Analysis · Not Peer-Reviewed
                  </div>
                  <h3 className="mt-1 text-lg font-display font-semibold text-white">
                    {activeReport.title}
                  </h3>
                  <div className="mt-1 text-xs font-mono text-slate-400">
                    ID: {activeReport.id} · Compiled {new Date(activeReport.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadPdf(activeReport)}
                    className="px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-md flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCsv(activeReport)}
                    className="px-3 py-2 bg-[#07090E] hover:bg-slate-900 border border-slate-700 text-slate-200 font-medium text-xs rounded-md flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-[#07090E] border border-slate-800 rounded p-3.5 space-y-1">
                  <div className="text-slate-400">Target Planetary Region</div>
                  <div className="font-semibold text-white">
                    {activeReport.reportPayload.targetRegion.name}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {activeReport.reportPayload.targetRegion.planet.toUpperCase()} ·{' '}
                    {activeReport.reportPayload.targetRegion.elevationDatum}
                  </div>
                </div>

                <div className="bg-[#07090E] border border-slate-800 rounded p-3.5 space-y-1">
                  <div className="text-slate-400">Earth Reference Analogue</div>
                  <div className="font-semibold text-white">
                    {activeReport.reportPayload.earthRegion.name}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {activeReport.reportPayload.earthRegion.countryOrQuadrangle} ·{' '}
                    {activeReport.reportPayload.earthRegion.elevationDatum}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <h4 className="font-semibold text-slate-200">Methodology &amp; Findings</h4>
                <p className="text-slate-300 leading-relaxed">{activeReport.summaryText}</p>
                <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
                  {activeReport.reportPayload.result.methodologyNotes}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-200">Limitations &amp; Caveats</h4>
                <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                  {activeReport.reportPayload.limitations.map((l, idx) => (
                    <li key={idx}>{l}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-semibold text-slate-200">Dataset Citations</h4>
                <ul className="space-y-1 text-[11px] font-mono text-slate-400">
                  {activeReport.reportPayload.citations.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <FileText className="w-7 h-7 text-slate-600" />
              <span>Select or generate a scientific comparison report to inspect and export.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

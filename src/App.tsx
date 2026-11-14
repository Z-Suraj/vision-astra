import React, { useCallback, useEffect, useState } from 'react';
import {
  AppSettings,
  DashboardSummary,
  DatasetRecord,
  GeographicRegion,
  ModuleId,
  PlanetId,
  ProcessingJob,
  ReportRecord,
  SimilarityResult,
} from './types';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './modules/DashboardView';
import { PlanetaryExplorerView } from './modules/PlanetaryExplorerView';
import { TerrainComparisonView } from './modules/TerrainComparisonView';
import { EarthAnalogFinderView } from './modules/EarthAnalogFinderView';
import { DataCenterView } from './modules/DataCenterView';
import { VisualizationLabView } from './modules/VisualizationLabView';
import { AIAssistantView } from './modules/AIAssistantView';
import { ReportsView } from './modules/ReportsView';
import { SettingsView } from './modules/SettingsView';

const DEFAULT_SETTINGS: AppSettings = {
  defaultNormalization: 'minmax',
  defaultMetric: 'weighted_euclidean',
  defaultWeights: {
    elevationRelief: 0.25,
    elevationStd: 0.15,
    slopeMean: 0.25,
    slopeMax: 0.1,
    roughnessTri: 0.2,
    temperatureMean: 0.05,
  },
  resampleGridSize: 32,
  includeTemperatureWhenAvailable: true,
  researcherName: 'Planetary Analog Researcher',
  institutionName: 'VISION ASTRAA Planetary Lab',
};

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [regions, setRegions] = useState<GeographicRegion[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [analyses, setAnalyses] = useState<SimilarityResult[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const [explorerPlanet, setExplorerPlanet] = useState<PlanetId>('mars');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [compareEarthId, setCompareEarthId] = useState<string | null>(null);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [sumRes, dsRes, regRes, jobRes, anaRes, repRes, setRes] = await Promise.all([
        fetch('/api/dashboard/summary'),
        fetch('/api/datasets'),
        fetch('/api/regions'),
        fetch('/api/analysis/jobs'),
        fetch('/api/analyses'),
        fetch('/api/reports'),
        fetch('/api/settings'),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (dsRes.ok) setDatasets(await dsRes.json());
      if (regRes.ok) {
        const regList: GeographicRegion[] = await regRes.json();
        setRegions(regList);
        if (!selectedRegionId && regList.length > 0) {
          const firstMars = regList.find((r) => r.planet === 'mars');
          setSelectedRegionId(firstMars?.id ?? regList[0].id);
        }
      }
      if (jobRes.ok) setJobs(await jobRes.json());
      if (anaRes.ok) setAnalyses(await anaRes.json());
      if (repRes.ok) setReports(await repRes.json());
      if (setRes.ok) setSettings(await setRes.json());
    } finally {
      setLoading(false);
    }
  }, [selectedRegionId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleLoadQuickSample = async () => {
    await fetch('/api/datasets/load-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleType: 'mars_crater' }),
    });
    await refreshAll();
    setActiveModule('data-center');
  };

  const handleJumpToRegion = (region: GeographicRegion) => {
    setExplorerPlanet(region.planet);
    setSelectedRegionId(region.id);
    setActiveModule('explorer');
  };

  const handleSaveSettings = async (updated: AppSettings) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setSettings(await res.json());
    }
  };

  const handleCompileReportShortcut = async (analysisId: string) => {
    await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId }),
    });
    await refreshAll();
    setActiveAnalysisId(analysisId);
    setActiveModule('reports');
  };

  return (
    <div className="min-h-screen flex bg-[#07090E] text-slate-100">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeModule={activeModule}
          regions={regions}
          activities={summary?.recentActivities ?? []}
          researcherName={settings.researcherName}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onJumpToRegion={handleJumpToRegion}
        />

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {activeModule === 'dashboard' && (
            <DashboardView
              summary={summary}
              datasets={datasets}
              loading={loading}
              onNavigate={setActiveModule}
              onExplorePlanet={(planet) => {
                setExplorerPlanet(planet);
                const first = regions.find((r) => r.planet === planet);
                if (first) setSelectedRegionId(first.id);
                setActiveModule('explorer');
              }}
              onLoadQuickSample={handleLoadQuickSample}
            />
          )}

          {activeModule === 'explorer' && (
            <PlanetaryExplorerView
              regions={regions}
              selectedPlanet={explorerPlanet}
              selectedRegionId={selectedRegionId}
              onSelectPlanet={(planet) => {
                setExplorerPlanet(planet);
                const first = regions.find((r) => r.planet === planet);
                if (first) setSelectedRegionId(first.id);
              }}
              onSelectRegion={(r) => {
                setExplorerPlanet(r.planet);
                setSelectedRegionId(r.id);
              }}
              onSendToComparison={(r) => {
                if (r.planet === 'earth') {
                  setCompareEarthId(r.id);
                } else {
                  setCompareTargetId(r.id);
                }
                setActiveModule('comparison');
              }}
            />
          )}

          {activeModule === 'comparison' && (
            <TerrainComparisonView
              regions={regions}
              settings={settings}
              initialTargetId={compareTargetId}
              initialEarthId={compareEarthId}
              onAnalysisComplete={(res) => {
                setActiveAnalysisId(res.analysisId);
                refreshAll();
              }}
              onAskAssistant={(targetId, earthId, analysisId) => {
                setCompareTargetId(targetId);
                setCompareEarthId(earthId);
                setActiveAnalysisId(analysisId);
                setActiveModule('assistant');
              }}
              onGenerateReport={handleCompileReportShortcut}
            />
          )}

          {activeModule === 'analog-finder' && (
            <EarthAnalogFinderView
              regions={regions}
              settings={settings}
              onInspectComparison={(targetId, earthId) => {
                setCompareTargetId(targetId);
                setCompareEarthId(earthId);
                setActiveModule('comparison');
              }}
            />
          )}

          {activeModule === 'data-center' && (
            <DataCenterView
              datasets={datasets}
              jobs={jobs}
              onRefresh={refreshAll}
            />
          )}

          {activeModule === 'visualization' && (
            <VisualizationLabView
              regions={regions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={(r) => setSelectedRegionId(r.id)}
            />
          )}

          {activeModule === 'assistant' && (
            <AIAssistantView
              regions={regions}
              analyses={analyses}
              initialTargetId={compareTargetId}
              initialEarthId={compareEarthId}
              initialAnalysisId={activeAnalysisId}
            />
          )}

          {activeModule === 'reports' && (
            <ReportsView
              reports={reports}
              analyses={analyses}
              initialAnalysisId={activeAnalysisId}
              onRefresh={refreshAll}
            />
          )}

          {activeModule === 'settings' && (
            <SettingsView settings={settings} onSaveSettings={handleSaveSettings} />
          )}
        </main>
      </div>
    </div>
  );
}

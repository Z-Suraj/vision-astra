import React, { useState } from 'react';
import { Bell, Menu, Search, User } from 'lucide-react';
import { ActivityLogEntry, GeographicRegion, ModuleId } from '../types';

interface TopBarProps {
  activeModule: ModuleId;
  regions: GeographicRegion[];
  activities: ActivityLogEntry[];
  researcherName: string;
  onOpenMobileNav: () => void;
  onJumpToRegion: (region: GeographicRegion) => void;
}

const MODULE_TITLES: Record<ModuleId, string> = {
  dashboard: 'Mission Overview Dashboard',
  explorer: 'Planetary Explorer',
  comparison: 'Terrain Comparison Studio',
  'analog-finder': 'Earth Analog Finder',
  'data-center': 'Scientific Data Center',
  visualization: 'Data Visualization Lab',
  assistant: 'AI Scientific Assistant',
  reports: 'Research Report Generator',
  settings: 'Project Settings & Architecture',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeModule,
  regions,
  activities,
  researcherName,
  onOpenMobileNav,
  onJumpToRegion,
}) => {
  const [query, setQuery] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);

  const matches = query.trim()
    ? regions
        .filter(
          (r) =>
            r.name.toLowerCase().includes(query.toLowerCase()) ||
            r.planet.toLowerCase().includes(query.toLowerCase()) ||
            r.countryOrQuadrangle.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 6)
    : [];

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0B0E17] px-4 lg:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 text-slate-300 hover:text-white border border-slate-800 rounded-md"
          aria-label="Open navigation"
        >
          <Menu className="w-4 h-4" />
        </button>
        <h1 className="font-display font-semibold text-base text-slate-100 truncate">
          {MODULE_TITLES[activeModule]}
        </h1>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="relative hidden sm:block w-64 md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Mars, Moon, Earth regions..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
          />
          {matches.length > 0 && (
            <div className="absolute left-0 right-0 mt-1.5 bg-[#0F1420] border border-slate-800 rounded-md overflow-hidden z-40">
              {matches.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onJumpToRegion(r);
                    setQuery('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800/70 border-b border-slate-800/60 last:border-b-0 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">{r.name}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {r.planet.toUpperCase()} · {r.countryOrQuadrangle}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 shrink-0 tabular-nums">
                    {r.latitude.toFixed(1)}°, {r.longitude.toFixed(1)}°
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifs((v) => !v)}
            className="p-2 text-slate-400 hover:text-slate-100 border border-slate-800 rounded-md transition-colors relative"
            aria-label="Recent activity notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          {showNotifs && (
            <div className="absolute right-0 mt-2 w-80 bg-[#0F1420] border border-slate-800 rounded-lg z-50 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Recent Pipeline Activity</span>
                <button
                  type="button"
                  onClick={() => setShowNotifs(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                >
                  Close
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
                {activities.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">No recent activities logged.</div>
                ) : (
                  activities.slice(0, 8).map((a) => (
                    <div key={a.id} className="px-3.5 py-2.5 text-xs">
                      <div className="flex items-center justify-between text-slate-200 font-medium">
                        <span>{a.action}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(a.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-0.5 leading-snug">{a.detail}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-800">
          <User className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
            {researcherName}
          </span>
        </div>
      </div>
    </header>
  );
};

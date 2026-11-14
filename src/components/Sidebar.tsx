import React from 'react';
import {
  Activity,
  Bot,
  Compass,
  Database,
  FileText,
  GitCompare,
  Globe2,
  LayoutDashboard,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { ModuleId } from '../types';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: ModuleId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'explorer', label: 'Planetary Explorer', icon: Globe2 },
  { id: 'comparison', label: 'Terrain Comparison', icon: GitCompare },
  { id: 'analog-finder', label: 'Earth Analog Finder', icon: Search },
  { id: 'data-center', label: 'Data Center', icon: Database },
  { id: 'visualization', label: 'Visualization Lab', icon: Activity },
  { id: 'assistant', label: 'AI Research Assistant', icon: Bot },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  mobileOpen,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex flex-col h-full w-64 bg-[#0B0E17] border-r border-slate-800/90">
      <div className="flex items-center justify-between h-14 px-5 border-b border-slate-800/90">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
            <Compass className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="font-display font-bold tracking-tight text-sm text-white whitespace-nowrap">
            VISION ASTRAA
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectModule(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/90 text-xs text-slate-500">
        <div className="text-slate-300 font-medium">Earth · Moon · Mars</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Planetary Terrain Digital Twin
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GeographicRegion, PlanetId } from '../types';

interface PlanetaryMap2DProps {
  planet: PlanetId;
  regions: GeographicRegion[];
  selectedRegionId: string | null;
  onSelectRegion: (region: GeographicRegion) => void;
  heightClass?: string;
}

const PLANET_TILE_CONFIG: Record<
  PlanetId,
  { url: string; attribution: string; label: string; maxZoom: number }
> = {
  earth: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    label: 'Earth Basemap (CARTO Dark / WGS84)',
    maxZoom: 16,
  },
  mars: {
    url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg',
    attribution: 'NASA Mars Trek / USGS Viking MDIM2.1',
    label: 'Mars Viking MDIM2.1 Global Mosaic (NASA Trek)',
    maxZoom: 7,
  },
  moon: {
    url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0//default/default028mm/{z}/{y}/{x}.jpg',
    attribution: 'NASA Moon Trek / LRO WAC Global Mosaic',
    label: 'Moon LRO WAC Global Mosaic (NASA Trek)',
    maxZoom: 7,
  },
};

export const PlanetaryMap2D: React.FC<PlanetaryMap2DProps> = ({
  planet,
  regions,
  selectedRegionId,
  onSelectRegion,
  heightClass = 'h-[420px]',
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [tileUnavailable, setTileUnavailable] = useState(false);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [10, 15],
      zoom: 2,
      minZoom: 1,
      maxZoom: 14,
      worldCopyJump: false,
      crs: L.CRS.EPSG4326,
    });

    const markers = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = markers;

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: Number(e.latlng.lat.toFixed(3)),
        lon: Number(e.latlng.lng.toFixed(3)),
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Switch tile layer cleanly when planet changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    setTileUnavailable(false);
    const cfg = PLANET_TILE_CONFIG[planet];
    let errorCount = 0;

    // CartoDB uses WebMercator (EPSG:3857) while NASA Trek EQ uses Equirectangular;
    // Leaflet CRS.EPSG4326 works cleanly for Trek EQ or we draw a calibrated graticule overlay too.
    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      noWrap: true,
    });

    layer.on('tileerror', () => {
      errorCount++;
      if (errorCount >= 4) {
        setTileUnavailable(true);
      }
    });

    layer.addTo(map);
    tileLayerRef.current = layer;

    // Draw clean lat/lon coordinate graticule lines so coordinates remain readable even if external tiles are blocked
    const graticule = L.layerGroup();
    for (let lat = -60; lat <= 60; lat += 30) {
      L.polyline(
        [
          [lat, -180],
          [lat, 180],
        ],
        { color: '#1e293b', weight: 1, dashArray: '3 4', interactive: false }
      ).addTo(graticule);
    }
    for (let lon = -150; lon <= 150; lon += 30) {
      L.polyline(
        [
          [-85, lon],
          [85, lon],
        ],
        { color: '#1e293b', weight: 1, dashArray: '3 4', interactive: false }
      ).addTo(graticule);
    }
    graticule.addTo(map);

    return () => {
      map.removeLayer(graticule);
    };
  }, [planet]);

  // Render region markers
  useEffect(() => {
    const map = mapRef.current;
    const markers = markersLayerRef.current;
    if (!map || !markers) return;

    markers.clearLayers();
    const planetRegions = regions.filter((r) => r.planet === planet);

    for (const r of planetRegions) {
      const isSelected = r.id === selectedRegionId;
      const color =
        r.planet === 'mars' ? '#f97316' : r.planet === 'moon' ? '#cbd5e1' : '#06b6d4';

      const marker = L.circleMarker([r.latitude, r.longitude], {
        radius: isSelected ? 9 : 6,
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? 2 : 1.5,
        fillColor: color,
        fillOpacity: isSelected ? 0.95 : 0.7,
      });

      marker.bindTooltip(
        `<div style="font-family:JetBrains Mono,monospace;font-size:11px;">
          <strong>${r.name}</strong><br/>
          ${r.latitude.toFixed(2)}°, ${r.longitude.toFixed(2)}° · Relief ${r.features.elevationReliefM} m
        </div>`,
        { direction: 'top' }
      );

      marker.on('click', () => {
        onSelectRegion(r);
      });

      marker.addTo(markers);

      if (isSelected) {
        map.setView([r.latitude, r.longitude], Math.max(map.getZoom(), 3), { animate: true });
      }
    }
  }, [planet, regions, selectedRegionId, onSelectRegion]);

  return (
    <div className="flex flex-col border border-slate-800 rounded-lg overflow-hidden bg-[#07090E]">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-[#0B0E17]">
        <span className="text-xs font-medium text-slate-200 truncate">
          {PLANET_TILE_CONFIG[planet].label}
        </span>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
          {cursorCoords
            ? `LAT ${cursorCoords.lat.toFixed(2)}° · LON ${cursorCoords.lon.toFixed(2)}°`
            : 'Hover map for coordinates'}
        </span>
      </div>
      <div className="relative">
        <div ref={mapContainerRef} className={`${heightClass} w-full z-0`} />
        {tileUnavailable && (
          <div className="absolute bottom-2 left-2 z-[400] px-2.5 py-1.5 bg-[#0B0E17]/95 border border-amber-500/40 rounded text-[11px] font-mono text-amber-300">
            External orbital base tiles unreachable in current network · Coordinate graticule & region pins active
          </div>
        )}
      </div>
    </div>
  );
};

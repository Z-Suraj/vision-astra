import React from 'react';
import { DataOrigin } from '../types';

export function formatOriginLabel(origin: DataOrigin): string {
  switch (origin) {
    case 'UPLOADED_RASTER':
      return 'Uploaded Raster';
    case 'SAMPLE_DEMONSTRATION':
      return 'Sample Demonstration';
    case 'OBSERVATION_REFERENCE':
    default:
      return 'Published Reference Summary';
  }
}

export function ProvenanceText({
  origin,
  sourceType,
  compact = false,
}: {
  origin: DataOrigin;
  sourceType?: 'PARSED_RASTER_MATRIX' | 'SYNTHETIC_GEOMORPHIC_PROXY';
  compact?: boolean;
}) {
  const toneClass =
    origin === 'UPLOADED_RASTER'
      ? 'text-cyan-400'
      : origin === 'SAMPLE_DEMONSTRATION'
      ? 'text-amber-400'
      : 'text-slate-400';

  return (
    <span className={`font-mono text-xs ${toneClass}`}>
      {formatOriginLabel(origin)}
      {!compact && sourceType && (
        <>
          <span className="text-slate-600 mx-1.5" aria-hidden="true">·</span>
          <span className="text-slate-400">
            {sourceType === 'PARSED_RASTER_MATRIX'
              ? 'Parsed Raster Grid'
              : 'Parametric Geomorphic Grid'}
          </span>
        </>
      )}
    </span>
  );
}

import { fromArrayBuffer } from 'geotiff';
import { TerrainFeatureMetrics } from '../src/types.ts';

export interface ParsedRasterInput {
  rawGrid: number[][];
  tempGrid: number[][] | null;
  nativeRows: number;
  nativeCols: number;
  validPixelCount: number;
  noDataCount: number;
  cellSizeMeters: number;
  crs: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  units: string;
  warnings: string[];
}

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15 && v !== -9999 && v !== -32768;
}

/**
 * Resample any 2D grid to targetRows x targetCols using bilinear interpolation
 */
export function resampleGrid(grid: number[][], targetRows = 32, targetCols = 32): number[][] {
  const srcRows = grid.length;
  const srcCols = grid[0]?.length ?? 0;
  if (srcRows === 0 || srcCols === 0) {
    return Array.from({ length: targetRows }, () => Array(targetCols).fill(0));
  }
  if (srcRows === targetRows && srcCols === targetCols) {
    return grid.map((r) => [...r]);
  }

  const out: number[][] = [];
  for (let r = 0; r < targetRows; r++) {
    const rowArr: number[] = [];
    const srcR = targetRows === 1 ? 0 : (r / (targetRows - 1)) * (srcRows - 1);
    const r0 = Math.floor(srcR);
    const r1 = Math.min(srcRows - 1, r0 + 1);
    const dr = srcR - r0;

    for (let c = 0; c < targetCols; c++) {
      const srcC = targetCols === 1 ? 0 : (c / (targetCols - 1)) * (srcCols - 1);
      const c0 = Math.floor(srcC);
      const c1 = Math.min(srcCols - 1, c0 + 1);
      const dc = srcC - c0;

      const v00 = grid[r0][c0];
      const v01 = grid[r0][c1];
      const v10 = grid[r1][c0];
      const v11 = grid[r1][c1];

      const top = v00 * (1 - dc) + v01 * dc;
      const bottom = v10 * (1 - dc) + v11 * dc;
      rowArr.push(top * (1 - dr) + bottom * dr);
    }
    out.push(rowArr);
  }
  return out;
}

/**
 * Extract genuine terrain features from a 2D elevation grid (and optional temperature grid)
 * using Horn's 3x3 finite-difference slope algorithm and Riley's Terrain Ruggedness Index (TRI).
 */
export function extractTerrainFeaturesFromGrid(
  regionId: string,
  elevationGridInput: number[][],
  cellSizeMeters: number,
  options?: {
    temperatureGrid?: number[][] | null;
    geomorphologyClass?: string;
    geologyNotes?: string;
    featureSourceType?: 'PARSED_RASTER_MATRIX' | 'SYNTHETIC_GEOMORPHIC_PROXY';
    targetGridSize?: number;
  }
): TerrainFeatureMetrics {
  const targetSize = options?.targetGridSize ?? 32;
  const grid = resampleGrid(elevationGridInput, targetSize, targetSize);
  const tempGrid = options?.temperatureGrid ? resampleGrid(options.temperatureGrid, targetSize, targetSize) : null;

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const flatElev: number[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      flatElev.push(grid[r][c]);
    }
  }

  flatElev.sort((a, b) => a - b);
  const n = flatElev.length || 1;
  const elevMin = flatElev[0] ?? 0;
  const elevMax = flatElev[n - 1] ?? 0;
  const elevSum = flatElev.reduce((acc, v) => acc + v, 0);
  const elevMean = elevSum / n;
  const elevMedian = n % 2 === 0 ? (flatElev[n / 2 - 1] + flatElev[n / 2]) / 2 : flatElev[Math.floor(n / 2)];
  const elevVariance = flatElev.reduce((acc, v) => acc + (v - elevMean) ** 2, 0) / n;
  const elevStd = Math.sqrt(elevVariance);
  const elevRelief = elevMax - elevMin;

  // Rescaled horizontal cell spacing when grid is resampled
  const origRows = elevationGridInput.length || targetSize;
  const effectiveDx = Math.max(1, cellSizeMeters * (origRows / rows));

  const slopeGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const roughnessGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const slopes: number[] = [];
  const triValues: number[] = [];
  const localVars: number[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rUp = Math.max(0, r - 1);
      const rDn = Math.min(rows - 1, r + 1);
      const cLt = Math.max(0, c - 1);
      const cRt = Math.min(cols - 1, c + 1);

      const a = grid[rUp][cLt];
      const b = grid[rUp][c];
      const cCell = grid[rUp][cRt];
      const d = grid[r][cLt];
      const e = grid[r][c];
      const f = grid[r][cRt];
      const g = grid[rDn][cLt];
      const h = grid[rDn][c];
      const i = grid[rDn][cRt];

      // Horn's 3x3 finite-difference slope
      const dzdx = (cCell + 2 * f + i - (a + 2 * d + g)) / (8 * effectiveDx);
      const dzdy = (g + 2 * h + i - (a + 2 * b + cCell)) / (8 * effectiveDx);
      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const slopeDeg = (slopeRad * 180) / Math.PI;
      slopeGrid[r][c] = Number(slopeDeg.toFixed(3));
      slopes.push(slopeDeg);

      // Riley's Terrain Ruggedness Index (TRI)
      const neighbors = [a, b, cCell, d, f, g, h, i];
      const sqDiffSum = neighbors.reduce((acc, nb) => acc + (nb - e) ** 2, 0);
      const tri = Math.sqrt(sqDiffSum / 8);
      roughnessGrid[r][c] = Number(tri.toFixed(3));
      triValues.push(tri);

      const localMean = (e + neighbors.reduce((s, v) => s + v, 0)) / 9;
      const localVar = Math.sqrt(
        ([e, ...neighbors].reduce((s, v) => s + (v - localMean) ** 2, 0)) / 9
      );
      localVars.push(localVar);
    }
  }

  const slopeMean = slopes.reduce((s, v) => s + v, 0) / (slopes.length || 1);
  const slopeMax = Math.max(...slopes, 0);
  const roughnessTri = triValues.reduce((s, v) => s + v, 0) / (triValues.length || 1);
  const localVariability = localVars.reduce((s, v) => s + v, 0) / (localVars.length || 1);

  const bins = [
    { label: '0–2°', min: 0, max: 2 },
    { label: '2–5°', min: 2, max: 5 },
    { label: '5–15°', min: 5, max: 15 },
    { label: '15–30°', min: 15, max: 30 },
    { label: '30–45°', min: 30, max: 45 },
    { label: '>45°', min: 45, max: 999 },
  ];
  const slopeDistribution = bins.map((bin) => {
    const count = slopes.filter((s) => s >= bin.min && s < bin.max).length;
    return {
      bin: bin.label,
      count,
      pct: Number(((count / (slopes.length || 1)) * 100).toFixed(1)),
    };
  });

  let tempMeanK: number | null = null;
  let tempMinK: number | null = null;
  let tempMaxK: number | null = null;
  let tempStdK: number | null = null;
  const missingFields: string[] = [];

  if (tempGrid) {
    const flatTemp = tempGrid.flat();
    tempMinK = Math.min(...flatTemp);
    tempMaxK = Math.max(...flatTemp);
    tempMeanK = flatTemp.reduce((s, v) => s + v, 0) / flatTemp.length;
    tempStdK = Math.sqrt(
      flatTemp.reduce((s, v) => s + (v - tempMeanK!) ** 2, 0) / flatTemp.length
    );
  } else {
    missingFields.push('Surface Temperature (Thermal band not present in dataset)');
  }

  let geomorphologyClass = options?.geomorphologyClass ?? '';
  if (!geomorphologyClass) {
    if (slopeMean < 2.5 && elevRelief < 250) {
      geomorphologyClass = 'Low-Relief Plains / Basin Floor';
    } else if (slopeMax > 28 && elevRelief > 1500) {
      geomorphologyClass = 'High-Relief Escarpment / Canyon System';
    } else if (slopeMean > 10 && roughnessTri > 25) {
      geomorphologyClass = 'Rugged Impact Crater / Rim Morphology';
    } else if (elevRelief > 800 && slopeMean < 12) {
      geomorphologyClass = 'Broad Volcanic Shield / Plateau';
    } else {
      geomorphologyClass = 'Dissected Upland / Transitional Terrain';
    }
  }

  return {
    regionId,
    elevationMinM: Number(elevMin.toFixed(2)),
    elevationMaxM: Number(elevMax.toFixed(2)),
    elevationMeanM: Number(elevMean.toFixed(2)),
    elevationMedianM: Number(elevMedian.toFixed(2)),
    elevationStdM: Number(elevStd.toFixed(2)),
    elevationReliefM: Number(elevRelief.toFixed(2)),
    slopeMeanDeg: Number(slopeMean.toFixed(2)),
    slopeMaxDeg: Number(slopeMax.toFixed(2)),
    slopeDistribution,
    roughnessTriM: Number(roughnessTri.toFixed(2)),
    localVariabilityM: Number(localVariability.toFixed(2)),
    tempMeanK: tempMeanK !== null ? Number(tempMeanK.toFixed(2)) : null,
    tempMinK: tempMinK !== null ? Number(tempMinK.toFixed(2)) : null,
    tempMaxK: tempMaxK !== null ? Number(tempMaxK.toFixed(2)) : null,
    tempStdK: tempStdK !== null ? Number(tempStdK.toFixed(2)) : null,
    geomorphologyClass,
    geologyNotes: options?.geologyNotes ?? 'Derived from uploaded elevation raster geometry.',
    featureSourceType: options?.featureSourceType ?? 'PARSED_RASTER_MATRIX',
    cellSizeMeters: Number(effectiveDx.toFixed(2)),
    gridRows: rows,
    gridCols: cols,
    elevationGrid: grid.map((r) => r.map((v) => Number(v.toFixed(2)))),
    slopeGrid,
    roughnessGrid,
    temperatureGrid: tempGrid ? tempGrid.map((r) => r.map((v) => Number(v.toFixed(2)))) : null,
    missingFields,
  };
}

/**
 * Parse uploaded GeoTIFF / TIFF buffer using geotiff.js
 */
export async function parseGeoTiffBuffer(buffer: Buffer): Promise<ParsedRasterInput> {
  const arrayBuf = Uint8Array.from(buffer).buffer;
  const tiff = await fromArrayBuffer(arrayBuf);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const band0 = rasters[0] as Float32Array | Int16Array | Int32Array | Uint16Array | Uint8Array;
  const noDataVal = image.getGDALNoData();
  const warnings: string[] = [];

  const fileDir = image.getFileDirectory();
  const geoKeys = image.getGeoKeys() as Record<string, unknown> | null;
  let crs = 'Unknown / Local Pixel Grid';
  if (geoKeys) {
    if (geoKeys.ProjectedCSTypeGeoKey) {
      crs = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
    } else if (geoKeys.GeographicTypeGeoKey) {
      crs = `EPSG:${geoKeys.GeographicTypeGeoKey}`;
    } else if (geoKeys.GTCitationGeoKey) {
      crs = String(geoKeys.GTCitationGeoKey);
    }
  }

  let cellSizeMeters = 30;
  try {
    const res = image.getResolution();
    if (res && Math.abs(res[0]) > 0) {
      const absRes = Math.abs(res[0]);
      // If geographic degrees (< 1), convert approx degrees to meters (~111320m at equator)
      cellSizeMeters = absRes < 1 ? absRes * 111320 : absRes;
    }
  } catch {
    warnings.push('Pixel scale not explicitly encoded in TIFF header; defaulted cell spacing to 30m.');
  }

  let bounds: ParsedRasterInput['bounds'] = null;
  try {
    const bbox = image.getBoundingBox();
    if (bbox && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
      bounds = {
        minLon: bbox[0],
        minLat: bbox[1],
        maxLon: bbox[2],
        maxLat: bbox[3],
      };
    }
  } catch {
    // non-georeferenced TIFF
  }

  // Downsample huge rasters safely while preserving valid stats
  const stepR = Math.max(1, Math.floor(height / 128));
  const stepC = Math.max(1, Math.floor(width / 128));
  const sampledRows: number[][] = [];
  let validPixelCount = 0;
  let noDataCount = 0;
  let validSum = 0;

  for (let r = 0; r < height; r += stepR) {
    for (let c = 0; c < width; c += stepC) {
      const val = Number(band0[r * width + c]);
      if (isValidNumber(val) && (noDataVal === null || val !== noDataVal)) {
        validSum += val;
        validPixelCount++;
      } else {
        noDataCount++;
      }
    }
  }

  const fallbackMean = validPixelCount > 0 ? validSum / validPixelCount : 0;
  for (let r = 0; r < height; r += stepR) {
    const rowArr: number[] = [];
    for (let c = 0; c < width; c += stepC) {
      const val = Number(band0[r * width + c]);
      if (isValidNumber(val) && (noDataVal === null || val !== noDataVal)) {
        rowArr.push(val);
      } else {
        rowArr.push(fallbackMean);
      }
    }
    sampledRows.push(rowArr);
  }

  if (noDataCount > 0) {
    warnings.push(`Filtered ${noDataCount} NoData / invalid cells during ingestion.`);
  }
  if (!(fileDir as unknown as Record<string, unknown>).ModelPixelScale && !bounds) {
    warnings.push('GeoTIFF lacks embedded geotransform metadata; inspect CRS before cross-planet alignment.');
  }

  return {
    rawGrid: sampledRows,
    tempGrid: null,
    nativeRows: height,
    nativeCols: width,
    validPixelCount,
    noDataCount,
    cellSizeMeters,
    crs,
    bounds,
    units: 'meters',
    warnings,
  };
}

/**
 * Parse CSV elevation dataset (supports either lat,lon,elevation[,temp] table OR pure 2D numeric elevation matrix)
 */
export function parseCsvElevation(content: string): ParsedRasterInput {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV file must contain at least 2 non-empty rows.');
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const firstCols = lines[0].split(delimiter).map((s) => s.trim().replace(/^["']|["']$/g, ''));
  const hasHeader = firstCols.some((c) => Number.isNaN(Number(c)));
  const warnings: string[] = [];

  if (!hasHeader) {
    // Treat as 2D elevation matrix
    const matrix: number[][] = [];
    let valid = 0;
    let noData = 0;
    for (const line of lines) {
      const vals = line.split(delimiter).map((x) => {
        const n = Number(x.trim());
        if (isValidNumber(n)) {
          valid++;
          return n;
        }
        noData++;
        return NaN;
      });
      matrix.push(vals);
    }
    const flatValid = matrix.flat().filter((v) => Number.isFinite(v));
    const mean = flatValid.length > 0 ? flatValid.reduce((a, b) => a + b, 0) / flatValid.length : 0;
    const cleanMatrix = matrix.map((r) => r.map((v) => (Number.isFinite(v) ? v : mean)));
    return {
      rawGrid: cleanMatrix,
      tempGrid: null,
      nativeRows: cleanMatrix.length,
      nativeCols: cleanMatrix[0]?.length ?? 0,
      validPixelCount: valid,
      noDataCount: noData,
      cellSizeMeters: 100,
      crs: 'Local Grid Matrix',
      bounds: null,
      units: 'meters',
      warnings: ['Parsed headerless numeric CSV matrix; assumed 100m nominal cell spacing.'],
    };
  }

  // Tabular CSV with column headers
  const headers = firstCols.map((h) => h.toLowerCase());
  const latIdx = headers.findIndex((h) => ['lat', 'latitude', 'y'].includes(h));
  const lonIdx = headers.findIndex((h) => ['lon', 'lng', 'longitude', 'x'].includes(h));
  const elevIdx = headers.findIndex((h) =>
    ['elevation', 'elev', 'elev_m', 'elevation_m', 'z', 'height', 'alt', 'altitude'].includes(h)
  );
  const tempIdx = headers.findIndex((h) =>
    ['temp', 'temp_k', 'temperature', 'temperature_k', 'lst'].includes(h)
  );

  if (elevIdx === -1) {
    throw new Error(
      `CSV header missing elevation column. Found columns: ${firstCols.join(', ')}. Expected one of: elevation, elev, elev_m, z, height.`
    );
  }

  const points: { lat: number; lon: number; elev: number; temp: number | null }[] = [];
  let noDataCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((s) => s.trim());
    const elev = Number(cols[elevIdx]);
    if (!isValidNumber(elev)) {
      noDataCount++;
      continue;
    }
    const lat = latIdx >= 0 ? Number(cols[latIdx]) : Math.floor((i - 1) / Math.ceil(Math.sqrt(lines.length)));
    const lon = lonIdx >= 0 ? Number(cols[lonIdx]) : (i - 1) % Math.ceil(Math.sqrt(lines.length));
    const tempVal = tempIdx >= 0 ? Number(cols[tempIdx]) : NaN;
    points.push({
      lat: Number.isFinite(lat) ? lat : 0,
      lon: Number.isFinite(lon) ? lon : 0,
      elev,
      temp: isValidNumber(tempVal) ? tempVal : null,
    });
  }

  if (points.length < 4) {
    throw new Error('CSV must contain at least 4 valid elevation samples.');
  }

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Gridding via Inverse Distance Weighting (IDW) onto 32x32 grid
  const size = 32;
  const grid: number[][] = [];
  const hasTemp = points.some((p) => p.temp !== null);
  const tempGrid: number[][] | null = hasTemp ? [] : null;
  const latSpan = maxLat - minLat || 0.01;
  const lonSpan = maxLon - minLon || 0.01;

  for (let r = 0; r < size; r++) {
    const rowArr: number[] = [];
    const tRow: number[] = [];
    const gy = maxLat - (r / (size - 1)) * latSpan;

    for (let c = 0; c < size; c++) {
      const gx = minLon + (c / (size - 1)) * lonSpan;
      let wSum = 0;
      let valSum = 0;
      let twSum = 0;
      let tValSum = 0;
      let exactHit: number | null = null;
      let exactTemp: number | null = null;

      for (const pt of points) {
        const d2 = (pt.lat - gy) ** 2 + (pt.lon - gx) ** 2;
        if (d2 < 1e-12) {
          exactHit = pt.elev;
          exactTemp = pt.temp;
          break;
        }
        const w = 1 / d2;
        wSum += w;
        valSum += w * pt.elev;
        if (pt.temp !== null) {
          twSum += w;
          tValSum += w * pt.temp;
        }
      }

      rowArr.push(exactHit !== null ? exactHit : valSum / (wSum || 1));
      if (tempGrid) {
        tRow.push(exactTemp !== null ? exactTemp : twSum > 0 ? tValSum / twSum : 220);
      }
    }
    grid.push(rowArr);
    if (tempGrid) tempGrid.push(tRow);
  }

  const approxSpanMeters = Math.max(latSpan * 111000, lonSpan * 85000, 1000);
  const cellSizeMeters = approxSpanMeters / size;
  if (latIdx === -1 || lonIdx === -1) {
    warnings.push('No explicit lat/lon columns found; interpolated points onto synthetic local index grid.');
  }
  if (noDataCount > 0) {
    warnings.push(`Skipped ${noDataCount} rows with missing or NoData elevation values.`);
  }

  return {
    rawGrid: grid,
    tempGrid,
    nativeRows: size,
    nativeCols: size,
    validPixelCount: points.length,
    noDataCount,
    cellSizeMeters,
    crs: latIdx >= 0 && lonIdx >= 0 ? 'Geographic Lat/Lon (WGS84 / Planetocentric)' : 'Local Grid',
    bounds: latIdx >= 0 && lonIdx >= 0 ? { minLat, maxLat, minLon, maxLon } : null,
    units: 'meters',
    warnings,
  };
}

/**
 * Parse GeoJSON or JSON elevation dataset
 */
export function parseJsonElevation(content: string): ParsedRasterInput {
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed?.elevationGrid)) {
    const grid = parsed.elevationGrid as number[][];
    return {
      rawGrid: grid,
      tempGrid: Array.isArray(parsed.temperatureGrid) ? parsed.temperatureGrid : null,
      nativeRows: grid.length,
      nativeCols: grid[0]?.length ?? 0,
      validPixelCount: grid.length * (grid[0]?.length ?? 0),
      noDataCount: 0,
      cellSizeMeters: Number(parsed.cellSizeMeters) || 100,
      crs: String(parsed.crs || 'Local Planetary Grid'),
      bounds: parsed.bounds ?? null,
      units: String(parsed.units || 'meters'),
      warnings: [],
    };
  }

  if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    const csvLines = ['lat,lon,elevation,temp'];
    for (const f of parsed.features) {
      const coords = f?.geometry?.coordinates;
      const props = f?.properties || {};
      const elev = props.elevation ?? props.elev ?? props.elevation_m ?? props.z ?? coords?.[2];
      const temp = props.temperature ?? props.temp_k ?? props.temp ?? '';
      if (Array.isArray(coords) && coords.length >= 2 && Number.isFinite(Number(elev))) {
        csvLines.push(`${coords[1]},${coords[0]},${elev},${temp}`);
      }
    }
    if (csvLines.length > 4) {
      return parseCsvElevation(csvLines.join('\n'));
    }
  }

  throw new Error('Unsupported JSON/GeoJSON structure. Provide a FeatureCollection with elevation properties or an elevationGrid 2D array.');
}

/**
 * Parse raw binary PDS .img / .bin elevation raster (16-bit big-endian integer or 32-bit float)
 */
export function parseRawImgBuffer(buffer: Buffer): ParsedRasterInput {
  const warnings: string[] = [];
  const totalInt16 = Math.floor(buffer.byteLength / 2);
  const dim = Math.min(64, Math.max(8, Math.floor(Math.sqrt(totalInt16))));
  const grid: number[][] = [];
  let valid = 0;
  let noData = 0;

  for (let r = 0; r < dim; r++) {
    const row: number[] = [];
    for (let c = 0; c < dim; c++) {
      const offset = (r * dim + c) * 2;
      if (offset + 2 <= buffer.byteLength) {
        const val = buffer.readInt16BE(offset);
        if (val !== -32768 && val !== -9999) {
          row.push(val);
          valid++;
        } else {
          row.push(0);
          noData++;
        }
      } else {
        row.push(0);
      }
    }
    grid.push(row);
  }

  warnings.push(
    `Parsed raw PDS/IMG binary as ${dim}x${dim} 16-bit big-endian signed elevation grid without external .LBL header; verify vertical scaling factor.`
  );

  return {
    rawGrid: grid,
    tempGrid: null,
    nativeRows: dim,
    nativeCols: dim,
    validPixelCount: valid,
    noDataCount: noData,
    cellSizeMeters: 463,
    crs: 'Mars MOLA Simple Cylindrical (Assumed)',
    bounds: null,
    units: 'meters',
    warnings,
  };
}

/**
 * Deterministic parametric geomorphic grid generator for Published Reference Summaries.
 * Explicitly tagged as SYNTHETIC_GEOMORPHIC_PROXY so 3D previews and heatmaps visualize
 * the region's documented relief, slope, and morphology without masquerading as raw PDS pixels.
 */
export function buildParametricReferenceGrid(params: {
  seedStr: string;
  minM: number;
  maxM: number;
  meanM: number;
  slopeMeanDeg: number;
  roughnessTriM: number;
  morphology: 'crater' | 'canyon' | 'volcano' | 'plains' | 'dunes' | 'rift';
  tempMeanK: number | null;
  tempMinK: number | null;
  tempMaxK: number | null;
  size?: number;
}): { elevationGrid: number[][]; temperatureGrid: number[][] | null } {
  const size = params.size ?? 32;
  let hash = 2166136261;
  for (let i = 0; i < params.seedStr.length; i++) {
    hash ^= params.seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const rand = (x: number, y: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + (hash % 1000)) * 43758.5453;
    return s - Math.floor(s);
  };

  const raw: number[][] = [];
  const relief = Math.max(10, params.maxM - params.minM);
  const roughScale = Math.min(0.22, params.roughnessTriM / Math.max(relief, 100));

  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    const ny = (r / (size - 1)) * 2 - 1;
    for (let c = 0; c < size; c++) {
      const nx = (c / (size - 1)) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);
      let h = 0;

      if (params.morphology === 'crater') {
        // Bowl with raised rim and optional central peak
        const rim = Math.exp(-((dist - 0.65) ** 2) / 0.03) * 0.85;
        const bowl = dist < 0.65 ? -0.45 * (1 - (dist / 0.65) ** 2) : -0.15 * (dist - 0.65);
        const peak = Math.exp(-(dist ** 2) / 0.015) * 0.45;
        h = rim + bowl + peak;
      } else if (params.morphology === 'canyon') {
        // Deep incised trough with terraced walls
        const canyonAxis = Math.abs(ny + 0.18 * Math.sin(nx * 2.5));
        const wall = Math.tanh((canyonAxis - 0.25) * 6);
        const sideBranch = Math.exp(-((nx - 0.2) ** 2) / 0.05) * (ny > 0 ? -0.25 : 0);
        h = wall * 0.5 + sideBranch;
      } else if (params.morphology === 'volcano') {
        // Broad shield with summit caldera
        const cone = Math.exp(-(dist ** 2) / 0.55);
        const caldera = dist < 0.18 ? -0.25 * (1 - (dist / 0.18) ** 2) : 0;
        h = cone + caldera;
      } else if (params.morphology === 'dunes') {
        // Barchan / linear ridge waves
        h = 0.35 * Math.sin(nx * 9 + Math.sin(ny * 4)) + 0.2 * Math.cos(ny * 5);
      } else if (params.morphology === 'rift') {
        // Faulted graben & volcanic ridges
        h = 0.45 * Math.abs(nx) + 0.2 * Math.sin(ny * 6) - 0.3 * Math.exp(-(nx * nx) / 0.08);
      } else {
        // Smooth undulating plains with gentle micro-craters
        h = 0.2 * Math.sin(nx * 2.5) * Math.cos(ny * 2.5) + 0.1 * Math.sin(nx * 5 + ny * 3);
      }

      // Deterministic multi-octave micro-roughness
      const micro =
        (rand(r, c) - 0.5) * roughScale * 1.4 +
        (rand(Math.floor(r / 2), Math.floor(c / 2)) - 0.5) * 0.12;
      row.push(h + micro);
    }
    raw.push(row);
  }

  // Rescale strictly to documented [minM, maxM]
  const flat = raw.flat();
  const rMin = Math.min(...flat);
  const rMax = Math.max(...flat);
  const rSpan = rMax - rMin || 1;
  const elevationGrid = raw.map((row) =>
    row.map((v) => Number((params.minM + ((v - rMin) / rSpan) * relief).toFixed(2)))
  );

  let temperatureGrid: number[][] | null = null;
  if (params.tempMeanK !== null && params.tempMinK !== null && params.tempMaxK !== null) {
    const tSpan = params.tempMaxK - params.tempMinK;
    temperatureGrid = elevationGrid.map((row, r) =>
      row.map((elev, c) => {
        // Lapse rate + solar aspect proxy
        const normElev = (elev - params.minM) / relief;
        const aspect = 0.5 + 0.5 * Math.sin((r / size) * Math.PI);
        const temp = params.tempMaxK! - normElev * tSpan * 0.65 - (1 - aspect) * tSpan * 0.35;
        return Number(Math.max(params.tempMinK!, Math.min(params.tempMaxK!, temp)).toFixed(2));
      })
    );
  }

  return { elevationGrid, temperatureGrid };
}

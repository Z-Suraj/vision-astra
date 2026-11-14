"""
VISION ASTRAA — Dedicated Python Geospatial Microservice (Production Reference)
Requires: fastapi, uvicorn, numpy, scipy, rasterio, geopandas, scikit-learn, gdal

Run independently in production when heavy multi-GB PDS IMG / GDAL reprojection
and scikit-learn clustering workloads are offloaded from the Node.js API gateway:
    uvicorn processor:app --host 0.0.0.0 --port 8001
"""

from typing import Optional
import numpy as np

try:
    import rasterio
    from fastapi import FastAPI, UploadFile, File, HTTPException
except ImportError:
    rasterio = None
    FastAPI = None


def compute_horn_slope_and_tri(elevation: np.ndarray, cell_size_m: float):
    """Compute Horn's 3x3 finite-difference slope (deg) and Riley's TRI (m)."""
    rows, cols = elevation.shape
    padded = np.pad(elevation, pad_width=1, mode="edge")
    dzdx = (
        (padded[:-2, 2:] + 2 * padded[1:-1, 2:] + padded[2:, 2:])
        - (padded[:-2, :-2] + 2 * padded[1:-1, :-2] + padded[2:, :-2])
    ) / (8.0 * cell_size_m)
    dzdy = (
        (padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:])
        - (padded[:-2, :-2] + 2 * padded[:-2, 1:-1] + padded[:-2, 2:])
    ) / (8.0 * cell_size_m)
    slope_deg = np.degrees(np.arctan(np.sqrt(dzdx**2 + dzdy**2)))

    sq_diff = np.zeros_like(elevation, dtype=np.float64)
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            shifted = padded[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols]
            sq_diff += (shifted - elevation) ** 2
    tri = np.sqrt(sq_diff / 8.0)
    return slope_deg, tri


if FastAPI is not None:
    app = FastAPI(title="VISION ASTRAA Python Geospatial Service")

    @app.post("/process-raster")
    async def process_raster(file: UploadFile = File(...), cell_size_m: Optional[float] = None):
        if rasterio is None:
            raise HTTPException(status_code=501, detail="rasterio/GDAL not installed in runtime.")
        with rasterio.MemoryFile(await file.read()) as memfile:
            with memfile.open() as src:
                arr = src.read(1).astype(np.float64)
                nodata = src.nodata
                if nodata is not None:
                    arr = np.where(arr == nodata, np.nan, arr)
                valid = arr[~np.isnan(arr)]
                if valid.size == 0:
                    raise HTTPException(status_code=400, detail="Raster contains zero valid pixels.")
                fill_val = float(np.nanmean(arr))
                clean = np.nan_to_num(arr, nan=fill_val)
                dx = cell_size_m or float(abs(src.transform.a)) or 30.0
                if dx < 1.0:
                    dx *= 111320.0
                slope_deg, tri = compute_horn_slope_and_tri(clean, dx)
                return {
                    "crs": str(src.crs),
                    "shape": list(arr.shape),
                    "elevation_min_m": float(np.min(valid)),
                    "elevation_max_m": float(np.max(valid)),
                    "elevation_mean_m": float(np.mean(valid)),
                    "elevation_std_m": float(np.std(valid)),
                    "slope_mean_deg": float(np.mean(slope_deg)),
                    "slope_max_deg": float(np.max(slope_deg)),
                    "roughness_tri_m": float(np.mean(tri)),
                }

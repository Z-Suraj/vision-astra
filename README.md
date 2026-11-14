# VISION ASTRAA

**Earth–Moon–Mars Terrain Intelligence & Digital Twin Platform**
*Understanding Planetary Landscapes Through Artificial Intelligence.*

## Architecture Overview

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Three.js (3D DEM heightfield viewer), Leaflet (2D planetary/Earth maps), Recharts (statistical distributions & radar profiles), jsPDF (report generation).
- **Backend**: Node.js + Express (`server.ts`) with REST API (`/api/*`), Multer file upload, `geotiff` raster parser, Horn 3×3 slope & Riley Terrain Ruggedness Index (TRI) extraction (`server/geospatial.ts`), and Gemini AI scientific assistant (`server/gemini.ts`).
- **Database**: SQLite (`better-sqlite3`) persisted to `./data/vision_astraa.db` for sandbox portability, accompanied by a production PostgreSQL + PostGIS schema (`docs/schema.postgis.sql`).
- **External Python Microservice Blueprint**: `python_service/processor.py` provides a FastAPI + Rasterio/GDAL/NumPy reference worker for heavy multi-GB planetary PDS rasters.

## Environment Variables

Configure via `.env` or AI Studio Secrets:
- `GEMINI_API_KEY`: Server-side Gemini API key used exclusively in `server/gemini.ts`.
- `PORT`: Server listening port (defaults to `3000`).

## Local & Production Commands

```bash
npm install
npm run dev      # Starts Express + Vite dev server on port 3000
npm run build    # Builds frontend bundle to dist/
npm run lint     # Runs TypeScript type checking (tsc --noEmit)
```

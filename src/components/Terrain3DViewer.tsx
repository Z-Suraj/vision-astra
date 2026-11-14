import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GeographicRegion } from '../types';
import { Layers, RotateCcw } from 'lucide-react';

export type ColorMode = 'elevation' | 'slope' | 'roughness' | 'temperature';

interface Terrain3DViewerProps {
  region: GeographicRegion | null;
  colorMode?: ColorMode;
  verticalExaggeration?: number;
  wireframe?: boolean;
  heightClass?: string;
  compact?: boolean;
}

function sampleColorRamp(t: number, mode: ColorMode, planet: string): THREE.Color {
  const clamped = Math.max(0, Math.min(1, t));
  const color = new THREE.Color();

  if (mode === 'slope') {
    // Low slope slate-cyan -> moderate amber -> steep crimson
    if (clamped < 0.5) {
      color.lerpColors(new THREE.Color('#0ea5e9'), new THREE.Color('#f59e0b'), clamped * 2);
    } else {
      color.lerpColors(new THREE.Color('#f59e0b'), new THREE.Color('#ef4444'), (clamped - 0.5) * 2);
    }
    return color;
  }

  if (mode === 'roughness') {
    // Smooth deep indigo -> teal -> bright lime/amber
    if (clamped < 0.5) {
      color.lerpColors(new THREE.Color('#1e293b'), new THREE.Color('#06b6d4'), clamped * 2);
    } else {
      color.lerpColors(new THREE.Color('#06b6d4'), new THREE.Color('#facc15'), (clamped - 0.5) * 2);
    }
    return color;
  }

  if (mode === 'temperature') {
    // Cold cobalt -> neutral cyan -> warm orange-red
    if (clamped < 0.5) {
      color.lerpColors(new THREE.Color('#1d4ed8'), new THREE.Color('#22d3ee'), clamped * 2);
    } else {
      color.lerpColors(new THREE.Color('#22d3ee'), new THREE.Color('#f97316'), (clamped - 0.5) * 2);
    }
    return color;
  }

  // Elevation hypsometric ramp tuned per planetary body
  if (planet === 'mars') {
    if (clamped < 0.35) {
      color.lerpColors(new THREE.Color('#451a03'), new THREE.Color('#9a3412'), clamped / 0.35);
    } else if (clamped < 0.72) {
      color.lerpColors(new THREE.Color('#9a3412'), new THREE.Color('#d97706'), (clamped - 0.35) / 0.37);
    } else {
      color.lerpColors(new THREE.Color('#d97706'), new THREE.Color('#fde68a'), (clamped - 0.72) / 0.28);
    }
    return color;
  }

  if (planet === 'moon') {
    if (clamped < 0.5) {
      color.lerpColors(new THREE.Color('#1e293b'), new THREE.Color('#64748b'), clamped * 2);
    } else {
      color.lerpColors(new THREE.Color('#64748b'), new THREE.Color('#e2e8f0'), (clamped - 0.5) * 2);
    }
    return color;
  }

  // Earth arid/terrain ramp
  if (clamped < 0.35) {
    color.lerpColors(new THREE.Color('#0f3b57'), new THREE.Color('#1e6b52'), clamped / 0.35);
  } else if (clamped < 0.7) {
    color.lerpColors(new THREE.Color('#1e6b52'), new THREE.Color('#b48a5a'), (clamped - 0.35) / 0.35);
  } else {
    color.lerpColors(new THREE.Color('#b48a5a'), new THREE.Color('#f1f5f9'), (clamped - 0.7) / 0.3);
  }
  return color;
}

export const Terrain3DViewer: React.FC<Terrain3DViewerProps> = ({
  region,
  colorMode: propColorMode = 'elevation',
  verticalExaggeration: propExag = 1.6,
  wireframe: propWireframe = false,
  heightClass = 'h-[420px]',
  compact = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [localColorMode, setLocalColorMode] = useState<ColorMode>(propColorMode);
  const [exaggeration, setExaggeration] = useState<number>(propExag);
  const [showWireframe, setShowWireframe] = useState<boolean>(propWireframe);
  const resetCameraRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setLocalColorMode(propColorMode);
  }, [propColorMode]);

  useEffect(() => {
    setExaggeration(propExag);
  }, [propExag]);

  useEffect(() => {
    setShowWireframe(propWireframe);
  }, [propWireframe]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !region) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090e');
    scene.fog = new THREE.FogExp2('#07090e', 0.022);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 200);
    camera.position.set(11.5, 8.8, 12.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 5;
    controls.maxDistance = 32;
    controls.target.set(0, 0.5, 0);

    // 3-point warm/cool planetary lighting rig
    const keyLight = new THREE.DirectionalLight('#fff4e6', 2.1);
    keyLight.position.set(14, 18, 10);
    keyLight.castShadow = !isSoftwareGl;
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight('#38bdf8', '#0f172a', 0.65);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight('#06b6d4', 0.7);
    rimLight.position.set(-12, 8, -12);
    scene.add(rimLight);

    // Build terrain BufferGeometry from elevationGrid
    const elevGrid = region.features.elevationGrid;
    const rows = elevGrid.length;
    const cols = elevGrid[0]?.length ?? 0;

    const planeSize = 12;
    const terrainGeo = new THREE.PlaneGeometry(planeSize, planeSize, Math.max(1, cols - 1), Math.max(1, rows - 1));
    terrainGeo.rotateX(-Math.PI / 2);

    const flatElev = elevGrid.flat();
    const minE = Math.min(...flatElev);
    const maxE = Math.max(...flatElev);
    const spanE = maxE - minE || 1;

    const activeScalarGrid =
      localColorMode === 'slope'
        ? region.features.slopeGrid
        : localColorMode === 'roughness'
        ? region.features.roughnessGrid
        : localColorMode === 'temperature' && region.features.temperatureGrid
        ? region.features.temperatureGrid
        : elevGrid;

    const flatScalar = activeScalarGrid.flat();
    const minS = Math.min(...flatScalar);
    const maxS = Math.max(...flatScalar);
    const spanS = maxS - minS || 1;

    const posAttr = terrainGeo.attributes.position;
    const colorArr = new Float32Array(posAttr.count * 3);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= posAttr.count) continue;
        const normH = (elevGrid[r][c] - minE) / spanE;
        const y = normH * 2.2 * exaggeration;
        posAttr.setY(idx, y);

        const sVal = activeScalarGrid[r]?.[c] ?? elevGrid[r][c];
        const normS = (sVal - minS) / spanS;
        const col = sampleColorRamp(normS, localColorMode, region.planet);
        colorArr[idx * 3] = col.r;
        colorArr[idx * 3 + 1] = col.g;
        colorArr[idx * 3 + 2] = col.b;
      }
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: region.planet === 'moon' ? 0.92 : 0.84,
      metalness: 0.06,
      wireframe: showWireframe,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    terrainMesh.castShadow = !isSoftwareGl;

    // Ground plinth / scientific datum base under terrain mesh
    const baseGeo = new THREE.BoxGeometry(planeSize, 0.35, planeSize);
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.7,
      metalness: 0.2,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.2;

    const gridHelper = new THREE.GridHelper(18, 18, '#1e293b', '#0f172a');
    gridHelper.position.y = -0.39;

    const terrainGroup = new THREE.Group();
    terrainGroup.add(terrainMesh);
    terrainGroup.add(baseMesh);
    scene.add(terrainGroup);
    scene.add(gridHelper);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    resetCameraRef.current = () => {
      camera.position.set(11.5, 8.8, 12.2);
      controls.target.set(0, 0.5, 0);
      controls.update();
      requestRender();
    };

    controls.addEventListener('change', requestRender);
    requestRender();

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      baseGeo.dispose();
      baseMat.dispose();
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, [region, localColorMode, exaggeration, showWireframe]);

  if (!region) {
    return (
      <div className={`${heightClass} flex items-center justify-center bg-[#07090E] border border-slate-800 rounded-lg text-slate-400 text-sm`}>
        Select a planetary or terrestrial region to render 3D terrain relief.
      </div>
    );
  }

  return (
    <div className="relative flex flex-col border border-slate-800 rounded-lg overflow-hidden bg-[#07090E]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 border-b border-slate-800 bg-[#0B0E17]">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-slate-200 truncate">{region.name}</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
            {region.features.gridRows}×{region.features.gridCols} DEM
          </span>
        </div>
        {!compact && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
              {(['elevation', 'slope', 'roughness', 'temperature'] as ColorMode[]).map((mode) => {
                const disabled = mode === 'temperature' && !region.features.temperatureGrid;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setLocalColorMode(mode)}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap capitalize ${
                      localColorMode === mode
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : disabled
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono whitespace-nowrap">
              <span>Z×{exaggeration.toFixed(1)}</span>
              <input
                type="range"
                min={0.5}
                max={3.5}
                step={0.1}
                value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))}
                className="w-16 accent-cyan-400 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowWireframe((v) => !v)}
              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap ${
                showWireframe
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Mesh
            </button>
            <button
              type="button"
              onClick={() => resetCameraRef.current?.()}
              className="p-1 text-slate-400 hover:text-slate-100 border border-slate-800 rounded transition-colors"
              title="Reset 3D Camera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div ref={mountRef} className={`${heightClass} w-full cursor-grab active:cursor-grabbing`} />
      <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-slate-800/80 bg-[#0B0E17] text-[11px] font-mono text-slate-400 tabular-nums">
        <span>
          {region.features.featureSourceType === 'PARSED_RASTER_MATRIX'
            ? 'Source: Uploaded Raster Heightfield'
            : 'Source: Parametric Geomorphic Reference Grid'}
        </span>
        <span>
          Relief ΔH: {region.features.elevationReliefM.toLocaleString()} m · Mean Slope: {region.features.slopeMeanDeg}°
        </span>
      </div>
    </div>
  );
};

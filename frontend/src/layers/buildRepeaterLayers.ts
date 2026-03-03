import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { RepeaterStation, CoTEntity } from "../types";

/** Colour by digital mode availability */
function repeaterColor(r: RepeaterStation, alpha: number): [number, number, number, number] {
  const modes = r.modes.map((m) => m.toLowerCase());
  if (modes.some((m) => m.includes("d-star") || m.includes("fusion") || m.includes("dmr") || m.includes("p25"))) {
    return [139, 92, 246, alpha]; // violet-500  — digital
  }
  if (r.status?.toLowerCase().includes("off")) {
    return [100, 116, 139, alpha]; // slate-500  — off-air
  }
  return [52, 211, 153, alpha]; // emerald-400 — standard FM open
}

/** Wrap a repeater as a CoTEntity so it works with the existing
 *  hover/tooltip pipeline without adding new state machinery. */
export function repeaterToEntity(r: RepeaterStation): CoTEntity {
  const modesStr = r.modes.length ? r.modes.join(", ") : "FM";
  return {
    uid: `repeater-${r.callsign}-${r.frequency}`,
    type: "repeater",
    lat: r.lat,
    lon: r.lon,
    altitude: 0,
    course: 0,
    speed: 0,
    callsign: r.callsign,
    lastSeen: Date.now(),
    trail: [],
    uidHash: 0,
    detail: {
      frequency: r.frequency,
      input_freq: r.input_freq,
      ctcss: r.ctcss ?? "none",
      use: r.use,
      status: r.status,
      city: r.city,
      state: r.state,
      modes: modesStr,
    },
  };
}

/** Group repeaters into clusters for cleaner overview at low zoom levels. */
function clusterRepeaters(repeaters: RepeaterStation[], zoom: number) {
  // Only cluster when zoomed out
  if (zoom >= 7.5) return { clusters: [], individuals: repeaters };

  // Grid size decreases as zoom increases.
  const gridSize = 120 / Math.pow(2, Math.max(1, zoom));
  const clusterMap = new Map<string, { lat: number; lon: number; count: number; representative: RepeaterStation }>();

  for (const r of repeaters) {
    const gx = Math.floor(r.lon / gridSize);
    const gy = Math.floor(r.lat / gridSize);
    const key = `${gx},${gy}`;

    const existing = clusterMap.get(key);
    if (existing) {
      existing.count++;
      existing.lat = (existing.lat * (existing.count - 1) + r.lat) / existing.count;
      existing.lon = (existing.lon * (existing.count - 1) + r.lon) / existing.count;
    } else {
      clusterMap.set(key, { lat: r.lat, lon: r.lon, count: 1, representative: r });
    }
  }

  const clusters: any[] = [];
  const individuals: RepeaterStation[] = [];

  for (const c of clusterMap.values()) {
    if (c.count > 1) {
      clusters.push({
        lat: c.lat,
        lon: c.lon,
        count: c.count,
        representative: c.representative
      });
    } else {
      individuals.push(c.representative);
    }
  }

  return { clusters, individuals };
}

export function buildRepeaterLayers(
  repeaters: RepeaterStation[],
  globeMode: boolean | undefined,
  onEntitySelect: (entity: CoTEntity | null) => void,
  setHoveredEntity: (entity: CoTEntity | null) => void,
  setHoverPosition: (pos: { x: number; y: number } | null) => void,
  zoom: number,
): any[] {
  if (repeaters.length === 0) return [];

  const modeKey = globeMode ? "globe" : "merc";
  const depthParams = { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 };
  const layers: any[] = [];

  const { clusters, individuals } = clusterRepeaters(repeaters, zoom);

  // 1. Clusters (only if they exist)
  if (clusters.length > 0) {
    layers.push(
      // Cluster Glow/Halo
      new ScatterplotLayer({
        id: `repeater-cluster-halo-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getRadius: (d: any) => 10 + Math.min(d.count / 3, 6),
        radiusUnits: "pixels" as const,
        getFillColor: [52, 211, 153, 40], // Muted Emerald alpha 40
        stroked: false,
        filled: true,
        pickable: false,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
      }),
      // Cluster Core
      new ScatterplotLayer({
        id: `repeater-clusters-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getRadius: (d: any) => 7 + Math.min(d.count / 5, 4),
        radiusUnits: "pixels" as const,
        getFillColor: [52, 211, 153, 255], // Emerald core
        stroked: true,
        getLineColor: [255, 255, 255, 220],
        getLineWidth: 1,
        lineWidthUnits: "pixels" as const,
        filled: true,
        pickable: true,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
      }),
      // Cluster Number Text
      new TextLayer({
        id: `repeater-cluster-labels-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getText: (d: any) => `${d.count}`,
        getSize: 10,
        getColor: [255, 255, 255, 255],
        getPixelOffset: [0, 1], // centre correction
        fontFamily: "monospace",
        fontWeight: "bold",
        billboard: true,
        pickable: false,
        wrapLongitude: !globeMode,
        parameters: depthParams,
      })
    );
  }

  // 2. Individuals (Non-clustered points)
  if (individuals.length > 0) {
    // Outer halo (non-pickable, decorative) - Skip in globe mode to reduce "bubble" clutter
    if (!globeMode) {
      layers.push(
        new ScatterplotLayer({
          id: `repeater-halo-${modeKey}`,
          data: individuals,
          getPosition: (d: RepeaterStation) => [d.lon, d.lat, 0],
          getRadius: 9,
          radiusUnits: "pixels" as const,
          radiusMinPixels: 5,
          getFillColor: (d: RepeaterStation) => repeaterColor(d, 40),
          stroked: false,
          filled: true,
          pickable: false,
          wrapLongitude: !globeMode,
          parameters: depthParams,
        }),
      );
    }

    // Core dot (pickable — hover tooltip + click to select)
    layers.push(
      new ScatterplotLayer({
        id: `repeater-dots-${modeKey}`,
        data: individuals,
        getPosition: (d: RepeaterStation) => [d.lon, d.lat, 0],
        getRadius: 5,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 3,
        getFillColor: (d: RepeaterStation) => repeaterColor(d, 220),
        getLineColor: [0, 0, 0, 0] as [number, number, number, number],
        stroked: false,
        filled: true,
        pickable: true,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
        onHover: (info: any) => {
          if (info.object) {
            setHoveredEntity(repeaterToEntity(info.object as RepeaterStation));
            setHoverPosition({ x: info.x, y: info.y });
          } else {
            setHoveredEntity(null);
            setHoverPosition(null);
          }
        },
        onClick: (info: any) => {
          if (info.object) {
            onEntitySelect(repeaterToEntity(info.object as RepeaterStation));
          }
        },
      }),
    );

    // Callsign + freq labels (only at zoom >= 9)
    if (zoom >= 9) {
      layers.push(
        new TextLayer({
          id: `repeater-labels-${modeKey}`,
          data: individuals,
          getPosition: (d: RepeaterStation) => [d.lon, d.lat, 0],
          getText: (d: RepeaterStation) => `${d.callsign}\n${d.frequency}`,
          getSize: 10,
          getColor: (d: RepeaterStation) => repeaterColor(d, 200),
          getPixelOffset: [0, -16],
          fontFamily: "monospace",
          fontWeight: "bold",
          billboard: true,
          pickable: false,
          wrapLongitude: !globeMode,
          parameters: { depthTest: true, depthBias: -100.0 },
          lineHeight: 1.3,
        }),
      );
    }
  }

  return layers;
}

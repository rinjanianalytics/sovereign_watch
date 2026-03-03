import { PathLayer } from "@deck.gl/layers";

type AotShapes = { maritime: number[][]; aviation: number[][] };
type Filters = { showSea?: boolean; showAir?: boolean; [key: string]: boolean | undefined };

export function buildAOTLayers(
  aotShapes: AotShapes | null,
  filters: Filters | undefined,
  globeMode: boolean | undefined,
): any[] {
  const layers: any[] = [];

  if (aotShapes && filters?.showSea !== false && aotShapes.maritime.length > 0) {
    layers.push(
      new PathLayer({
        id: `aot-maritime-${globeMode ? "globe" : "merc"}`,
        data: [{ path: aotShapes.maritime.map((p) => [p[0], p[1], 0]) }],
        getPath: (d: any) => d.path,
        getColor: [0, 191, 255, 150], // #00BFFF at ~60% opacity
        getWidth: 2.5,
        widthMinPixels: 2,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        billboard: !!globeMode,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
      }),
    );
  }

  if (aotShapes && filters?.showAir !== false && aotShapes.aviation.length > 0) {
    layers.push(
      new PathLayer({
        id: `aot-aviation-${globeMode ? "globe" : "merc"}`,
        data: [{ path: aotShapes.aviation.map((p) => [p[0], p[1], 0]) }],
        getPath: (d: any) => d.path,
        getColor: [0, 255, 100, 150], // #00FF64 at ~60% opacity
        getWidth: 2.5,
        widthMinPixels: 2,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        billboard: !!globeMode,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
      }),
    );
  }

  return layers;
}

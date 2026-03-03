import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";

// Helper to convert hex colors (e.g. '#3b82f6') to [R, G, B, A] array required by Deck.GL
function hexToRgb(hex: string, alpha: number = 255): [number, number, number, number] {
    if (!hex) return [59, 130, 246, alpha]; // Default to '#3b82f6' if no color
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
    const g = parseInt(cleanHex.slice(2, 4), 16) || 255;
    const b = parseInt(cleanHex.slice(4, 6), 16) || 255;
    return [r, g, b, alpha];
}

export function buildInfraLayers(
    cablesData: any,
    stationsData: any,
    filters: any,
    setHoveredInfra: (info: any) => void,
    setSelectedInfra: ((info: any) => void) | undefined,
    selectedEntity: any = null,
    globeMode: boolean = false
) {
    const layers = [];

    // Submarine Cables Layer - uses GeoJsonLayer
    if (cablesData && filters?.showCables !== false) {
        layers.push(
            new GeoJsonLayer({
                id: `submarine-cables-layer-${globeMode ? "globe" : "merc"}`,
                data: cablesData,
                pickable: true,
                stroked: false,
                filled: false,
                lineWidthScale: 10,
                lineWidthMinPixels: 3, // Increased from 2 for better clickability
                getLineColor: (d: any) => {
                    const isSelected = selectedEntity?.uid === String(d.properties?.id);
                    const opacity = isSelected ? 255 : (filters?.cableOpacity ?? 0.6) * 255;
                    const colorHex = isSelected ? '#38bdf8' : d.properties?.color;
                    return hexToRgb(colorHex, opacity);
                },
                getLineWidth: (d: any) => {
                    const isSelected = selectedEntity?.uid === String(d.properties?.id);
                    return isSelected ? 4 : 2;
                },
                updateTriggers: {
                    getLineColor: [filters?.cableOpacity, selectedEntity?.uid],
                    getLineWidth: [selectedEntity?.uid]
                },
                transitions: {
                    getLineColor: 300,
                    getLineWidth: 300
                },
                wrapLongitude: !globeMode,
                parameters: globeMode ? { depthTest: true, depthBias: -210.0 } : undefined,
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    // Cable Landing Stations Layer - uses ScatterplotLayer
    if (stationsData && filters?.showLandingStations !== false) {
        // Build a map of cable names to colors for efficient lookup
        const cableColorMap: Record<string, string> = {};
        if (cablesData?.features) {
            cablesData.features.forEach((f: any) => {
                const name = f.properties?.name;
                const color = f.properties?.color;
                if (name && color) cableColorMap[name.toLowerCase()] = color;
            });
        }

        layers.push(
            new ScatterplotLayer({
                id: `cable-stations-layer-${globeMode ? "globe" : "merc"}`,
                data: stationsData.features || [],
                pickable: true,
                opacity: 0.8,
                stroked: true,
                filled: true,
                radiusScale: 100,
                radiusMinPixels: 4,
                radiusMaxPixels: 20,
                lineWidthMinPixels: 1,
                getPosition: (d: any) => d.geometry.coordinates,
                getFillColor: (d: any) => {
                    // Try to find matching cable color
                    const cableList = (d.properties?.cables || "").split(",");
                    for (const rawName of cableList) {
                        const name = rawName.trim().toLowerCase();
                        if (cableColorMap[name]) {
                            return hexToRgb(cableColorMap[name], 200);
                        }
                    }
                    return [0, 200, 255, 200]; // Default cyan fallback
                },
                getLineColor: [255, 255, 255, 100],
                updateTriggers: {
                    getFillColor: [cablesData]
                },
                wrapLongitude: !globeMode,
                parameters: globeMode ? { depthTest: true, depthBias: -210.0 } : undefined,
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    return layers;
}

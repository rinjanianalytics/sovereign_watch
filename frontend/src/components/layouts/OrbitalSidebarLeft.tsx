import React, { useState, useEffect } from 'react';
import { MapFilters, PassResult } from '../../types';
import { OrbitalCategoryPills } from '../widgets/OrbitalCategoryPills';
import { PolarPlotWidget } from '../widgets/PolarPlotWidget';
import { PassPredictorWidget } from '../widgets/PassPredictorWidget';
import { DopplerWidget } from '../widgets/DopplerWidget';
import { usePassPredictions } from '../../hooks/usePassPredictions';
import { getMissionArea } from '../../api/missionArea';

interface OrbitalSidebarLeftProps {
    filters: MapFilters;
    onFilterChange: (key: string, value: unknown) => void;
    selectedSatNorad: number | null;
    setSelectedSatNorad: (noradId: number | null) => void;
    trackCount: number;
}

const DEFAULT_LAT = parseFloat(import.meta.env.VITE_CENTER_LAT || '45.5152');
const DEFAULT_LON = parseFloat(import.meta.env.VITE_CENTER_LON || '-122.6784');

export const OrbitalSidebarLeft: React.FC<OrbitalSidebarLeftProps> = ({
    filters,
    onFilterChange,
    selectedSatNorad,
    setSelectedSatNorad,
    trackCount
}) => {
    const [observerLat, setObserverLat] = useState(DEFAULT_LAT);
    const [observerLon, setObserverLon] = useState(DEFAULT_LON);

    // Sync observer location with active mission area on mount
    useEffect(() => {
        getMissionArea()
            .then((mission) => {
                if (mission?.lat && mission?.lon) {
                    setObserverLat(mission.lat);
                    setObserverLon(mission.lon);
                }
            })
            .catch(() => {/* silently fall back to defaults */});
    }, []);

    const { passes, loading } = usePassPredictions(observerLat, observerLon);

    // Track which pass is selected (by index in the passes array)
    const [selectedPassIndex, setSelectedPassIndex] = useState(0);

    const selectedPass: PassResult | undefined = passes[selectedPassIndex];

    // Map PassResult to the shape PassPredictorWidget expects
    const widgetPasses = passes.map((p) => ({
        norad_id: parseInt(p.norad_id, 10) || 0,
        name: p.name,
        aos: p.aos,
        tca: p.tca,
        los: p.los,
        max_elevation: p.max_elevation,
        aos_azimuth: p.aos_azimuth,
        los_azimuth: p.los_azimuth,
        duration_seconds: p.duration_seconds,
    }));

    // Map PassResult.points to DopplerWidget's passPoints shape
    const dopplerPoints = selectedPass?.points.map((pt) => ({
        time: pt.t,
        slant_range_km: pt.slant_range_km,
        elevation: pt.el,
    })) ?? [];

    // Map PassResult.points to PolarPlotWidget's pass.points shape
    const polarPass = selectedPass
        ? {
              points: selectedPass.points.map((pt, i) => ({
                  azimuth: pt.az,
                  elevation: pt.el,
                  time: pt.t,
                  isAos: i === 0,
                  isTca: pt.t === selectedPass.tca,
                  isLos: i === selectedPass.points.length - 1,
              })),
          }
        : undefined;

    const handlePassClick = (norad: number) => {
        const idx = passes.findIndex((p) => parseInt(p.norad_id, 10) === norad);
        if (idx >= 0) setSelectedPassIndex(idx);
        setSelectedSatNorad(norad);
    };

    return (
        <div className="flex flex-col h-full gap-2 animate-in fade-in duration-1000">
            <OrbitalCategoryPills filters={filters} onFilterChange={onFilterChange} trackCount={trackCount} />

            <PassPredictorWidget
                passes={widgetPasses}
                homeLocation={{ lat: observerLat, lon: observerLon }}
                onPassClick={handlePassClick}
                isLoading={loading}
            />

            {selectedSatNorad && <DopplerWidget passPoints={dopplerPoints} />}
            <div className="mt-auto">
                <PolarPlotWidget pass={polarPass} />
            </div>
        </div>
    );
};

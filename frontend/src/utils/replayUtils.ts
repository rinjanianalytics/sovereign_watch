import { CoTEntity } from '../types';

/**
 * Processes raw replay data into a map of entities, each containing a time-sorted list of snapshots.
 *
 * @param data The raw array of track points from the API.
 * @returns A Map where the key is the entity UID and the value is an array of CoTEntity snapshots sorted by time.
 */
export function processReplayData(data: any[]): Map<string, CoTEntity[]> {
  const cache = new Map<string, CoTEntity[]>();

  data.forEach((pt: any) => {
    // Convert DB row to CoTEntity partial
    // Note: DB returns snake_case, CoTEntity is strict.
    // We need manual mapping.

    // Parse meta safely
    let meta: any = {};
    try {
      meta = typeof pt.meta === 'string' ? JSON.parse(pt.meta) : pt.meta || {};
    } catch { /* ignore */ }

    const entity: CoTEntity = {
      uid: pt.entity_id,
      type: pt.type,
      lat: pt.lat,
      lon: pt.lon,
      altitude: pt.alt,
      speed: pt.speed,
      course: pt.heading,
      callsign: meta.callsign || pt.entity_id,
      time: new Date(pt.time).getTime(),
      lastSeen: new Date(pt.time).getTime(),
      trail: [], // Replay doesn't need trails yet or we can generate them
      uidHash: 0 // Will be computed by map
    };

    if (!cache.has(entity.uid)) cache.set(entity.uid, []);
    cache.get(entity.uid)?.push(entity);
  });

  // Note: Data from backend is already sorted by time (ORDER BY time ASC).
  // Since we push to entity lists in order, each entity list is naturally sorted.
  // No need for client-side sorting.

  return cache;
}

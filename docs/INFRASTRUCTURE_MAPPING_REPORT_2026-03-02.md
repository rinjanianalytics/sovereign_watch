# Infrastructure Mapping: Current State & Expansion Roadmap
**Sovereign Watch — Research Report**
**Date:** 2026-03-02
**Version:** v0.13.0
**Author:** Agent Review

---

## 1. Executive Summary

This report assesses the current state of infrastructure mapping in Sovereign Watch and proposes new intelligence layers focused on radio communications infrastructure — specifically P25 trunked radio systems and emergency services networks. The platform already has a solid RF infrastructure foundation via RepeaterBook integration; the next logical phase is to deepen spectrum situational awareness with trunked radio systems, APRS networks, and emergency communications infrastructure.

---

## 2. Current Infrastructure Mapping — What We Have

### 2.1 RF Repeater Layer (DONE — v0.12.0)

The repeater layer is fully operational and more capable than it may appear:

**Data Source:** RepeaterBook.com public REST API (`/api/repeaters` backend proxy)
**Coverage:** Amateur radio repeaters within a configurable radius (default 75 mi) of mission center

**What the API already returns per repeater:**
| Field | Description |
|---|---|
| `callsign` | FCC callsign |
| `frequency` | Output frequency (MHz) |
| `input_freq` | Input offset frequency |
| `ctcss` | PL tone / CTCSS code |
| `use` | OPEN / CLOSED / PRIVATE |
| `status` | Operational status |
| `city`, `state` | Location |
| `modes` | Array: FM Analog, D-Star, Fusion, DMR, **P25**, NXDN, TETRA |

**Frontend rendering** (`buildRepeaterLayers.ts`):
- Clustered view at low zoom (breakpoint 7.5), individual dots at high zoom
- Color coding: **Emerald** (FM analog), **Violet** (digital modes incl. P25/DMR/D-Star), **Slate** (off-air)
- Callsign + frequency labels at zoom ≥ 9
- Hover tooltip + click-to-select with full metadata panel

**Key finding:** P25 data already flows through the repeater pipeline. RepeaterBook marks P25-capable repeater sites, and the frontend already renders them in violet. However, this only captures P25 *repeater/linking* sites — it does **not** capture dedicated P25 *trunked radio systems* which are a separate infrastructure category with much greater strategic value.

### 2.2 Submarine Cable Layer (DONE — v0.12.0)

- Animated Deck.gl `PathLayer` for cable routes
- `ScatterplotLayer` for landing stations
- SubmarineCableMap.com data with 24h localStorage cache
- Click-to-select with full metadata (operators, capacity, year, landing points)
- INFRA layer group toggle in `LayerFilters.tsx`

### 2.3 JS8Call HF Digital Radio (DONE)

- Full HF radio terminal integrated in the frontend (`RadioTerminal.tsx`)
- JS8Call station tracking on the tactical map
- TCP bridge to local KiwiSDR/JS8Call instance
- Emerald color scheme consistent with RF infrastructure

### 2.4 Layer Filters — Current INFRA State

`LayerFilters.tsx` currently has:
- `AIR` (with sub-filters: HELO, MIL, GOV, COM, CIV, DRONE)
- `SEA` (with sub-filters: CARGO, TANKER, PASSENGER, FISHING, MIL, LAW ENF, SAR, TUG, PLEASURE, HSC, PILOT, SPECIAL)
- `ORBITAL` (with sub-filters: GPS, WEATHER, COMMS, INTEL)
- `REPEATERS` (no sub-filters currently)

**Gap:** No sub-filters for repeater modes (e.g., show only P25 sites, filter by band). No APRS, no tower infrastructure, no emergency services layers.

---

## 3. Roadmap Reconciliation — ROADMAP.md vs. Changelog

The `ROADMAP.md` is partially out of date. Here is the corrected status:

| ID | Task | ROADMAP Status | Actual Status |
|---|---|---|---|
| **FE-21** | Undersea Cable Layer | P1 — Next Priority | **DONE** (v0.12.0) |
| **Ingest-07a** | ADS-B Drone Enhancement | P1 — Next Priority | **DONE** (v0.12.1) |
| **Audit-01** | Code Review | P1 — Next Priority | **DONE** (v0.13.0, 20 bugs fixed) |
| **FE-22** | Drone Tactical Layer | P1 — Next Priority | **Pending** (no DroneLayer.tsx found) |
| **Fix-01** | CoT Tracking Restore | P1 — Next Priority | **Pending** |
| **Ingest-07** | Drone Remote ID Poller | P2 — Backlog | **Pending** |
| **Ingest-08** | Infra Caching (backend) | P2 — Backlog | **Pending** |

**Recommended action:** Update `ROADMAP.md` to move FE-21, Ingest-07a, and Audit-01 to the Completed section.

---

## 4. Proposed New Features: Radio & Emergency Services Infrastructure

### 4.1 P25 Trunked Radio System Layer

**Strategic Value:** HIGH

P25 (Project 25 / APCO-25) is the dominant digital radio standard for North American public safety — police, fire, EMS, and military all use it. Mapping P25 *systems* (not just repeater sites) reveals the communications backbone of emergency services in the area of operations.

The distinction is critical:
- A **P25 repeater** in RepeaterBook is typically an amateur radio linking node
- A **P25 trunked system** is a multi-site coordinated network with potentially dozens of RF sites, serving thousands of first responders — this is what matters for intelligence

**Data Source:** RadioReference.com

RadioReference maintains the most comprehensive public database of P25 trunked radio systems globally. Their API provides:

| Field | Description |
|---|---|
| System ID / WACN | Worldwide Area Communications Network ID |
| RFSS / Site IDs | RF Sub-System and site identifiers |
| Site coordinates | Lat/lon for each tower site |
| Control channels | Primary and alternate control channel frequencies |
| Talkgroup list | Assigned agencies and talkgroup IDs |
| System type | P25 Phase 1 / Phase 2, Motorola SmartNet, etc. |
| Agency affiliation | Law enforcement, fire, EMS, military |

**Architecture Proposal:**

```
RadioReference.com API (HTTP Pulse, 7-day refresh)
    └─> sovereign-p25-pulse (Python async, new service)
        └─> Fetch systems by bounding box
            └─> Parse sites, frequencies, agencies
                └─> Cache to Redis (7-day TTL)
                    └─> /api/p25 (FastAPI endpoint)
                        └─> P25Layer.tsx (Deck.gl)
```

**Visualization:**
- Tower sites as distinct diamond markers (different from repeater dots)
- Color by agency type: Amber (Law Enforcement), Red (Fire/EMS), Blue (Government), Purple (Military/Federal)
- Coverage radius circles per site (estimated from site elevation + antenna height if available)
- Hover tooltip: System name, agency, WACN, site ID, control channel
- Click to select: Full sidebar with all talkgroups, site list, frequency table
- System boundary polygon (convex hull of all sites in a system) for territorial awareness
- Sub-filters in LayerFilters: LAW ENF, FIRE/EMS, FEDERAL, MILITARY

**New IDs:**
- `Ingest-09`: P25 System Pulse (backend)
- `FE-23`: P25 Trunked System Layer (frontend)

**Note on access:** RadioReference has a free tier and a Premium API tier. The free web-scraping approach is fragile. The Premium Database API (`https://www.radioreference.com/apps/api/`) is recommended — it provides structured JSON responses for trunked systems, sites, and talkgroups. Alternatively, the community-maintained `trunk-recorder` project maintains P25 system databases that can be used offline.

---

### 4.2 APRS (Automatic Packet Reporting System) Infrastructure Layer

**Strategic Value:** MEDIUM-HIGH

APRS is a real-time digital communications protocol operating on 144.390 MHz (North America) used for:
- Position reporting (vehicles, aircraft, balloons)
- Weather stations
- Emergency net infrastructure (ARES/RACES digipeaters and iGates)
- Messaging and object beacons

Mapping APRS infrastructure reveals the *amateur radio emergency communications network* — the backbone that activates during disasters when cellular infrastructure fails.

**Data Sources:**
- **aprs.fi API** (free, no key required for basic queries): `https://api.aprs.fi/api/get?name=...&what=loc&apikey=...`
- **APRS-IS Network** (direct connection): TCP connection to `rotate.aprs2.net:14580` with filter `r/lat/lon/radius`
- **aprsdirect.com** and **aprs2.net** provide iGate/digipeater lists

**Two sub-layers proposed:**

**4.2a APRS Station Tracking** (real-time positions):
- Vehicles, aircraft, weather stations reporting via APRS
- TAK type: `a-f-G` (ground) or `a-f-A` (air) depending on symbol
- Already architecturally similar to ADS-B poller — APRS-IS is a TCP stream
- Color: Yellow-green (distinct from existing layers)

**4.2b APRS Infrastructure** (static iGates/Digipeaters):
- iGates (internet-connected receive gateways) — mark internet connection points
- Digipeaters (RF relay nodes) — mark RF coverage topology
- Useful for understanding radio coverage gaps and emergency net architecture
- Color: Same Emerald as repeaters (RF infrastructure family)

**Architecture:**
```
APRS-IS TCP stream (rotate.aprs2.net:14580)
    └─> sovereign-aprs-poller (Python async, new service)
        └─> Filter: position reports + station beacons
            └─> Parse: callsign, lat, lon, symbol, comment, speed, course
                └─> TAK Protobuf → Kafka topic: aprs_raw
                    └─> Frontend: APRSLayer.tsx
```

**New IDs:**
- `Ingest-10`: APRS Stream Poller (backend)
- `FE-24`: APRS Tactical Layer (frontend)

---

### 4.3 Emergency Services Infrastructure Layer

**Strategic Value:** HIGH for domestic situational awareness

This layer maps the *physical infrastructure* of emergency services — not radio chatter, but the facilities and fixed installations that anchor the communications network.

**Sub-layers:**

**4.3a PSAP / 911 Dispatch Centers**
- Data: FCC PSAP Registry (`https://www.fcc.gov/consumers/guides/911-and-e911-services`)
- NENA database (National Emergency Number Association) has public lists
- These are the nerve centers — knowing their locations is strategic
- Color: Red cross / emergency red

**4.3b NOAA Weather Radio Transmitters**
- Data: NOAA NWR transmitter database (public CSV) — `https://www.weather.gov/nwr/`
- 1,000+ transmitters in the US, all with lat/lon, frequencies, and coverage areas
- Extremely easy to implement — static CSV bundled as an asset (like submarine cables)
- Useful for correlating with AOR for emergency weather monitoring capability
- Color: Cyan (weather theme) or distinct orange

**4.3c FCC Antenna Structure Registration (ASR)**
- Data: FCC ASR Database (public download) — `https://www.fcc.gov/asr/`
- Every registered communication tower in the US with lat/lon, height (AGL/AMSL), owner, lighting
- Massive dataset (~100,000 structures) — needs spatial filtering to AOR
- Backend service to load and query by bounding box
- Useful for identifying transmission infrastructure, obstruction planning, visual correlation with ADS-B
- Color: White/gray (neutral infrastructure)

**New IDs:**
- `FE-25a`: NOAA Weather Radio Layer (frontend only, static asset — easy win)
- `Ingest-11`: FCC ASR Tower Service (backend)
- `FE-25b`: FCC Tower Infrastructure Layer (frontend)
- `FE-25c`: PSAP / 911 Center Layer (frontend, static GeoJSON asset)

---

### 4.4 DMR / Digital Mobile Radio Network Layer

**Strategic Value:** MEDIUM

DMR (Digital Mobile Radio) is used extensively by commercial operations, utilities, and increasingly public safety agencies (especially internationally). The Brandmeister and DMR-MARC networks maintain public APIs for connected repeaters and talkgroup activity.

**Data Source:**
- **Brandmeister API**: `https://api.brandmeister.network/v2/` — lists all connected DMR repeaters with lat/lon, talkgroup activity, last heard
- **DMR-MARC**: CSV export available
- Already partially represented in RepeaterBook (DMR mode flag), but Brandmeister provides *live activity* data

**Unique value:** Brandmeister shows which DMR repeaters are actively transmitting — this is near-real-time spectrum activity visibility without SDR hardware.

**New ID:**
- `Ingest-12`: Brandmeister DMR Activity Pulse (backend)
- `FE-26`: DMR Network Activity Layer (frontend)

---

### 4.5 Repeater Sub-Filter Enhancements (Low Effort, High Value)

The existing repeater layer could be substantially more useful with minor enhancements to the current filter controls in `LayerFilters.tsx`:

**Proposed sub-filters for the REPEATERS section:**

| Filter | Mode | Color |
|---|---|---|
| FM ANALOG | FM Analog only | Emerald |
| P25 | P25 flag set | Violet |
| DMR | DMR flag set | Purple |
| D-STAR | D-Star flag set | Blue |
| FUSION | YSF/Fusion flag set | Teal |
| OPEN | `use == "OPEN"` | Brighter |
| LINKED | Linked systems | Amber |

This requires no new data source — all mode data already exists in the API response. Only `LayerFilters.tsx` and `buildRepeaterLayers.ts` need updates.

**New ID:**
- `FE-27`: Repeater Mode Sub-Filters (frontend only)

---

## 5. Feature Priority Matrix

| ID | Feature | Source | Complexity | Strategic Value | Recommended Priority |
|---|---|---|---|---|---|
| **FE-22** | Drone Tactical Layer | Existing ADS-B | Low | Medium | **P1 — Active** |
| **FE-27** | Repeater Mode Sub-Filters | Existing RepeaterBook | Very Low | Medium | **P1 — Quick Win** |
| **FE-25a** | NOAA Weather Radio Layer | Static NOAA CSV | Very Low | Medium | **P1 — Quick Win** |
| **FE-25c** | PSAP / 911 Centers Layer | Static GeoJSON | Very Low | High | **P1 — Quick Win** |
| **Ingest-09 / FE-23** | P25 Trunked System Layer | RadioReference API | Medium | Very High | **P2** |
| **Ingest-10 / FE-24** | APRS Infrastructure Layer | APRS-IS TCP | Medium | High | **P2** |
| **Ingest-11 / FE-25b** | FCC ASR Tower Layer | FCC Public DB | Medium | Medium | **P2** |
| **Ingest-12 / FE-26** | DMR Brandmeister Layer | Brandmeister API | Low | Medium | **P2** |
| **Fix-01** | CoT Tracking Restore | Existing | Unknown | High | **P1 — Active** |
| **Ingest-08** | Infra Backend Caching | Existing | Low | Low | **P2** |
| **Ingest-07** | Drone Remote ID SDR | Hardware req. | High | High | **P3** |

---

## 6. Recommended P1 Implementation Plan

Given the current state at v0.13.0, these four items represent the best effort-to-value ratio and should be the next sprint:

### Sprint A — Frontend Completions (No New Backend Needed)

1. **FE-22: Drone Tactical Layer**
   - `DroneLayer.tsx` — dedicated drone icon layer (distinct hexagonal shape)
   - Wire to existing `showDrone` filter in `LayerFilters.tsx`
   - `DroneDetail.tsx` — sidebar panel showing `drone_class`, operator, squawk

2. **FE-27: Repeater Mode Sub-Filters**
   - Expand the REPEATERS section in `LayerFilters.tsx` with expandable sub-filters
   - Add filter props: `showRepFM`, `showRepP25`, `showRepDMR`, `showRepDStar`, `showRepFusion`
   - Update `buildRepeaterLayers.ts` to respect new filter keys

3. **FE-25a: NOAA Weather Radio Layer**
   - Download `https://www.weather.gov/source/nwr/station.json` (or CSV equivalent)
   - Bundle as `frontend/public/data/noaa-weather-radio.json`
   - Simple `ScatterplotLayer` with coverage circles
   - Color: Amber/orange (`#f59e0b`) with frequency label at zoom ≥ 9
   - Toggle in INFRA section of `LayerFilters.tsx`

4. **FE-25c: PSAP / 911 Center Layer**
   - Source FCC PSAP registry data (public CSV/JSON)
   - Bundle as `frontend/public/data/psap-centers.geojson`
   - `ScatterplotLayer` with red cross marker style
   - Click: name, county, state, type (primary/backup)
   - Toggle in INFRA section

### Sprint B — New Backend Services

5. **Ingest-09 / FE-23: P25 Trunked System Intelligence**
   - Backend `sovereign-p25-pulse` service: query RadioReference by bounding box, cache 7 days
   - Frontend `P25Layer.tsx`: sites, coverage circles, agency coloring
   - New COMMS section in `LayerFilters.tsx` with P25 sub-filter

6. **Ingest-10 / FE-24: APRS Network**
   - Backend `sovereign-aprs-poller`: APRS-IS TCP connection with spatial filter
   - Frontend `APRSLayer.tsx`: station dots + iGate/digipeater infrastructure markers
   - New filter under COMMS section

---

## 7. Roadmap Updates Required

The following changes should be made to `ROADMAP.md`:

### Move to Completed:
- **FE-21** — Undersea Cable Layer (done v0.12.0)
- **Ingest-07a** — ADS-B Drone Enhancement (done v0.12.1)
- **Audit-01** — Code Review (done v0.13.0)

### Add to Next Priority (P1):
| ID | Task | Component | Description |
|---|---|---|---|
| **FE-22** | Drone Tactical Layer | Frontend | `DroneLayer.tsx` with rotor icon, `DroneDetail.tsx` sidebar |
| **FE-27** | Repeater Mode Sub-Filters | Frontend | Add P25/DMR/D-Star/Fusion/FM sub-toggles to existing REPEATERS filter |
| **FE-25a** | NOAA Weather Radio Layer | Frontend | Static asset layer, coverage circles, frequency labels |
| **FE-25c** | PSAP / 911 Centers Layer | Frontend | Static GeoJSON, emergency services dispatch center markers |

### Add to Backlog (P2):
| ID | Task | Component | Description |
|---|---|---|---|
| **Ingest-09** | P25 Trunked System Pulse | Data Eng | RadioReference API → P25 system sites, agencies, frequencies |
| **FE-23** | P25 System Layer | Frontend | `P25Layer.tsx`: sites, coverage, agency coloring, talkgroup sidebar |
| **Ingest-10** | APRS Stream Poller | Data Eng | APRS-IS TCP → `aprs_raw` Kafka topic |
| **FE-24** | APRS Infrastructure Layer | Frontend | iGates, digipeaters, APRS station tracking |
| **Ingest-11** | FCC ASR Tower Service | Data Eng | FCC public DB → tower locations by bounding box |
| **FE-25b** | FCC Tower Layer | Frontend | `TowerLayer.tsx`: communication tower infrastructure |
| **Ingest-12** | DMR Brandmeister Pulse | Data Eng | Brandmeister API → live DMR repeater activity |
| **FE-26** | DMR Activity Layer | Frontend | `DMRLayer.tsx`: Brandmeister-connected repeaters with live activity |

---

## 8. Conclusion

Sovereign Watch's infrastructure mapping is already ahead of most OSINT tools with working repeater and submarine cable layers. The clearest next steps are:

1. **Finish what's started** — FE-22 (Drone layer) and Fix-01 (CoT tracking) are incomplete P1 items
2. **Quick wins in the current sprint** — Repeater sub-filters, NOAA Weather Radio, and PSAP centers can all be done with zero new backend work using public static datasets
3. **P25 is the right next major feature** — It's the most strategically valuable gap in the RF picture. A RadioReference-backed P25 trunked system layer would be unique among open-source OSINT platforms and directly complements the existing repeater layer
4. **APRS rounds out the HF/VHF/UHF picture** — Combined with JS8Call (already operational), an APRS layer would give full situational awareness of the amateur radio emergency communications mesh in the AOR

The existing architecture (Python async pollers → Redpanda → FastAPI WebSocket → Deck.gl) handles all of these without modification. New features are primarily additive new pollers and new Deck.gl layer components following established patterns.

---

_Report generated 2026-03-02. Based on codebase review of v0.13.0._

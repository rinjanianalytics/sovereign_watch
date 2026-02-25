# Release Notes - Sovereign Watch v0.10.0

## Tactical HF Communication & JS8Call Integration

Version 0.10.0 introduces a major expansion to Sovereign Watch's signal intelligence capabilities with the deep integration of **JS8Call**. This update enables operators to monitor HF digital mode communications directly within the tactical interface, bridging the gap between global radio networks and our unified map display.

### Key Features

#### 📡 JS8Call Tactical Bridge
A new specialized container orchestration allows `js8call` to run as a native service. It features a high-performance PulseAudio-based virtual audio pipeline, enabling seamless ingestion from networked KIWI-SDRs or local radio equipment.

#### 💬 Real-Time HUD Widget
The frontend now includes a dedicated **JS8 HUD Widget** in the sidebar. 
- **Live Stream**: View incoming and outgoing JS8 messages in real-time.
- **Frequency Control**: Monitor station offsets and drift directly from the UI.
- **Station Discovery**: Automatic identification of active stations heard on the air.

#### 🗺️ Spatial Awareness
Incoming JS8 signals are no longer just text. When a station provides grid coordinates or is identified by callsign, it is visualized as a specialized tactical entity on the **Map**.
- **Live Status Icons**: See which stations are active and their relative signal strength.
- **Entity Linking**: Click on a station on the map to instantly focus the JS8 widget on their recent traffic.

### Infrastructure & Resilience
- **Robust Audio Pipeline**: Re-engineered entrypoints for the `js8call` service ensure that virtual audio sinks are correctly initialized before the software starts, eliminating "no audio device" errors.
- **Volume persistence**: Config and rig settings for JS8Call are now persisted across container restarts.

### Setup Instructions
1. Ensure your `.env` file contains the correct `KIWI_SDR_HOST` and `JS8_RIG_NAME` variables.
2. Run `docker compose up -d js8call` to start the new service.
3. Access the JS8 widget via the "Signal Intel" section in the left sidebar.

---
# Live Race Streaming with Smelter

## Overview

[Smelter](https://smelter.dev) is a real-time, low-latency video compositing toolkit by Software Mansion. It could enable RaceDash to expand from post-race video editing into **live race streaming and broadcasting**.

## What Smelter Offers

- Ultra-low latency video composition (real-time mixing of multiple sources)
- Dynamic overlays — text, graphics, animations, transitions
- Declarative React/TypeScript SDK
- Deployment via Docker, WebAssembly (browser), or Elixir/Membrane plugin
- Free tier for hobbyists, enterprise tier for production use

## Potential Use Cases for RaceDash

### Live Race Broadcasting
Composite multiple camera angles (in-car, trackside, drone) into a single live broadcast with real-time switching and transitions.

### Live Telemetry Overlays
Overlay real-time telemetry data (speed, lap times, sector splits, tyre info) onto a live video feed — the same data RaceDash already processes, but rendered live instead of post-race.

### Multi-Driver Picture-in-Picture
Show multiple drivers' onboard feeds simultaneously with dynamic layouts that adapt based on race events (e.g., expand the view of whoever is in a battle).

### Live Race Director View
A "race control" style interface where an operator (or automation) can switch between feeds, trigger replays, and overlay graphics — similar to what F1 TV offers but for amateur/club racing.

### Live-to-VOD Pipeline
Record the composited live stream directly, producing a finished video that needs minimal post-processing — bridging the gap between RaceDash's current offline editing and a live workflow.

## How It Complements Current RaceDash

| Current (Remotion/offline) | Future (Smelter/live) |
|---|---|
| Post-race video generation | Real-time race broadcasting |
| Static telemetry overlays baked into video | Dynamic overlays updating in real-time |
| Single video source at a time | Multiple simultaneous camera feeds |
| Render time after the race | Instant output during the race |

RaceDash's existing telemetry parsing, data models, and overlay designs could be reused — Smelter would be the new rendering backend for the live path.

## Technical Considerations

- **Deployment**: Smelter can run as a Docker container, making it suitable for a cloud-hosted streaming service or a local machine at the track.
- **Integration**: The React/TypeScript SDK aligns with RaceDash's existing tech stack.
- **Input sources**: Would need RTMP/SRT ingest from cameras — requires investigating what amateur racing teams typically have available.
- **Latency budget**: For a live broadcast, sub-second latency is ideal. Smelter is designed for this.
- **Cost**: Free tier may suffice for development. Production streaming at scale would need the enterprise tier or self-hosted deployment.

## Open Questions

- What is the demand for live streaming among RaceDash's target users (amateur/club racers)?
- Do users have multi-camera setups, or would this primarily be single in-car camera + telemetry overlay?
- Should this be a separate product/tier, or an extension of the existing desktop app?
- What infrastructure would be needed for cloud-based live compositing vs local-only?

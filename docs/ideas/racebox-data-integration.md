# RaceBox (Mokadamo) Data Integration

**Date:** 2026-03-19
**Status:** Research
**Feeds into:** Timing source support, data import pipeline

---

## Context

Mokadamo is an Austrian company that makes steering-wheel mounting hardware for karts (the KartBuddy system). They are **not a data logger manufacturer** — they resell the **RaceBox Mini** GPS logger as part of their bundles. The actual data integration target is RaceBox.

RaceBox Mini is a standalone 25Hz GPS + IMU logger popular in karting, particularly among drivers who don't use AIM or Alfano systems.

---

## RaceBox Mini Hardware

- 25Hz multi-constellation GNSS (GPS, GLONASS, Galileo, BeiDou)
- 10cm positioning accuracy, 1/100s timing precision
- 3-axis accelerometer (±8G) + 3-axis gyroscope (±320°/s)
- Bluetooth 5.2 (iOS/Android)
- USB-C, splash-proof, ~20h battery

---

## File Formats / Export

RaceBox data syncs to [racebox.pro](https://www.racebox.pro) cloud. Sessions are exported via the web portal in:

| Format | Contents | Notes |
|---|---|---|
| **CSV** | All channels | Customizable columns, presets for Telemetry Overlay / RaceRenderer / Custom |
| **VBO** | Position + speed + G-force | VBOX-compatible, works with Circuit Tools / RaceChrono |
| **GPX** | Position + time only | No G-force data |
| **KML** | Position + time only | No G-force data |

**CSV is the richest export format** and the primary integration target.

---

## Data Channels

| Channel | Unit | Notes |
|---|---|---|
| Latitude | degrees × 1e-7 (integer) | |
| Longitude | degrees × 1e-7 (integer) | |
| WGS Altitude | mm | |
| MSL Altitude | mm | |
| Speed | mm/s (GPS-derived) | |
| Heading | degrees × 1e-5 | |
| G-Force X | milli-g | Divide by 1000 for g |
| G-Force Y | milli-g | |
| G-Force Z | milli-g | |
| Horizontal Accuracy | mm | |
| Vertical Accuracy | mm | |
| Speed Accuracy | mm/s | |
| Satellite Count | integer | |
| PDOP | × 0.01 | |
| Timestamp | UTC with nanosecond precision | |
| Battery Status | percentage (Mini) or voltage×10 (Micro) | |

All values are **little-endian integers** with fixed-point scaling (same pattern as Alfano).

---

## BLE Protocol (for future live integration)

RaceBox uses a BLE UART protocol derived from U-Blox NAV-PVT format:

- **Header:** `0xB5 0x62` (2 bytes)
- **Message class + ID:** `0xFF 0x01` for live data
- **Payload:** 80 bytes, 88 bytes total per packet
- **Data rate:** Up to 25Hz
- **Checksum:** 2 bytes

BLE Service UUIDs:
- UART Service: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- RX: `6E400002-...`
- TX: `6E400003-...`

Protocol documentation available by request from RaceBox: [racebox.pro/products/mini-micro-protocol-documentation](https://www.racebox.pro/products/mini-micro-protocol-documentation)

---

## Companion Apps

RaceBox data can also flow through third-party apps:

| App | Export Formats | Notes |
|---|---|---|
| **RaceBox App** | Via cloud portal (CSV/VBO/GPX/KML) | Free, requires RaceBox hardware |
| **RaceChrono** | CSV, VBO | Popular alternative, ~20 EUR Pro |
| **Harry's Lap Timer** | Various | ~9 EUR+ |

---

## Open-Source Projects

| Project | Language | Notes |
|---|---|---|
| [ESP32-RaceBox](https://github.com/lademeister/ESP32-RaceBox) | C++ (Arduino) | **Best reference.** Full BLE data message parsing on ESP32. |
| [racebox-tools](https://github.com/jl2/racebox-tools) | Common Lisp | Logs RaceBox data to SQLite, exports GPX |
| [RaceBoxTest](https://github.com/peytoncchen/RaceBoxTest) | Swift | iOS CoreBluetooth integration |
| [Racebox-Unity-Integration](https://github.com/Augmented-Sailing/Racebox-Unity-Integration) | C# (Unity) | Android BLE integration |
| [ESP32-RaceBox-mini-Emulator](https://github.com/anchit92/ESP32-RaceBox-mini-Emulator) | C++ (Arduino) | RaceBox Mini emulator for testing |

No official SDK for cloud data — only BLE protocol docs for device-level access.

---

## Recommended Approach for RaceDash

1. **Phase 1: Import CSV exports** from RaceBox cloud — standard text format, easiest path
2. **Phase 2 (optional): Parse VBO format** for users who export via RaceChrono
3. **Phase 3 (future): BLE live integration** — connect directly to RaceBox Mini via Bluetooth for real-time data during recording (desktop app would need BLE support)
4. **Lap detection:** RaceBox CSV may or may not include lap splits depending on export settings — may need to compute laps from GPS trace + track definition

---

## Open Questions

- What does the RaceBox CSV export actually look like? (Column names, format, sample rate)
- Does RaceBox export include lap times, or only raw GPS/IMU traces that require lap detection?
- Is VBO format worth supporting given it loses some channels vs CSV?
- Would BLE live integration be valuable, or is post-session import sufficient for RaceDash's use case?

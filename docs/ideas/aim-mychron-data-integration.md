# AIM / Mychron Data Integration

**Date:** 2026-03-19
**Status:** Research
**Feeds into:** Timing source support, data import pipeline

---

## Context

AIM Technologies (Mychron) is one of the most common data logging systems in karting and club-level motorsport. Integrating AIM data would allow RaceDash users to use lap times, telemetry channels, and GPS data from their Mychron/AIM loggers as a timing source and overlay data source.

---

## File Formats

### XRK (primary, current)

- **Type:** Proprietary binary format — AIM does not publish the binary specification
- **Used by:** MXP, MXG, MXL2, EVO4/EVO5, MyChron5, MyChron6
- **XRZ** files are simply zipped XRK files (one XRZ contains exactly one XRK)
- **Contains:**
  - Session metadata: Vehicle, Racer, Championship, Venue Type, Track, Date & Time (acquisition start)
  - Lap count with start time (seconds) and duration (seconds) per lap
  - Logged data channels (device-configuration-dependent)
  - GPS computed channels
  - GPS raw channels

### DRK (legacy)

- **Type:** Proprietary binary format from Race Studio 2 era
- **Lower capacity** than XRK, still importable by Race Studio 3
- No public spec exists; AIM's DLL supports DRK in "beta" mode

### Race Studio 3 Database

- Not a standard format (not SQLite), proprietary indexing/catalog layer
- RS3 **references** XRK/DRK files from their original disk location — it does not copy them
- No known way to access directly outside RS3
- Not relevant for RaceDash — we would import XRK/XRZ files directly

---

## Data Available in XRK Files

### Session Metadata

| Field | Source |
|---|---|
| Vehicle | Set by user in AIM logger |
| Track | Auto-identified by logger from tracks sent via RS3 |
| Racer | Set by user in AIM logger |
| Championship | Set by user in AIM logger |
| Venue Type | Set by user in AIM logger |
| Date & Time | Acquisition start, managed by logger |

### Lap Data

- Lap count and per-lap start time + duration (all in seconds)
- Example: `Lap [0] - start 0.011000 (s) - duration 82.248000 (s)`

### Three Categories of Data Channels

**1. Logged Channels** (device-configuration-dependent):
- Logger Temperature, Exhaust Temp, Water Temp
- AccelerometerX, AccelerometerY, AccelerometerZ
- GyroX, GyroY, GyroZ
- Int Batt Voltage, RPM
- (varies by device and configuration)

**2. GPS Computed Channels** (derived by parser from raw GPS data):
- `GPS_Speed`, `GPS_Nsat`, `GPS_LatAcc`, `GPS_LonAcc`
- `GPS_Slope`, `GPS_Heading`, `GPS_Gyro`, `GPS_Altitude`
- `GPS_PosAccuracy`, `GPS_SpdAccuracy`, `GPS_FreqAccuracy`
- `GPS_East`, `GPS_North`

**3. GPS Raw Channels:**
- `ECEF position_X` (m), `ECEF position_Y` (m), `ECEF position_Z` (m)
- `ECEF velocity_X` (m/s), `ECEF velocity_Y` (m/s), `ECEF velocity_Z` (m/s)
- `N Satellites` (count)

Channel data is available on either a **session timing base** or a **per-lap timing base**.

---

## Approaches to Reading XRK Files

### Option A: AIM's Official MatLabXRK DLL

AIM provides a shared library (DLL/SO) documented in `MatLabXRK.h`:
- [Official PDF documentation](https://www.aimsportsystems.com.au/download/software/doc/how-to-access-xrk-files-data-without-aim-software_101.pdf)
- Functions for: open/close file, get metadata, get lap count/times, enumerate channels, read channel data (session or per-lap), access GPS channels
- **Platforms:** Windows 64-bit, Linux 64-bit only
- **No macOS support** — non-starter for RaceDash desktop (Electron on macOS)
- Not thread-safe (global state)

### Option B: Native XRK Parser (reverse-engineered)

**[TrackDataAnalysis](https://github.com/racer-coder/TrackDataAnalysis)** contains `aim_xrk.pyx` — a Cython file that reverse-engineered the XRK binary format and parses it directly without the AIM DLL.
- **Cross-platform** including macOS ARM
- Only known open-source native parser
- Could be used as a reference to write a TypeScript or Rust parser for RaceDash

### Option C: Existing Wrappers (DLL-dependent, for reference only)

| Project | Language | Notes |
|---|---|---|
| [xdrk](https://github.com/bmc-labs/xdrk) | Rust | Safe Rust bindings around AIM DLL. Win/Linux only. |
| [briguy-official/xrk](https://github.com/briguy-official/xrk) | Python | ctypes wrapper around DLL. MIT license. |
| [laz-/xrk](https://github.com/laz-/xrk) | Python | DLL wrapper with Jupyter examples. |
| [Aim_2_MoTeC](https://github.com/ludovicb1239/Aim_2_MoTeC) | C# | Converts AIM → MoTeC LD format via DLL. |

---

## Recommended Approach for RaceDash

1. **Study `aim_xrk.pyx`** from TrackDataAnalysis to understand the reverse-engineered binary layout
2. **Write a TypeScript or Rust XRK parser** based on that reference — no dependency on AIM's DLL, fully cross-platform
3. **Start with lap times + GPS data** as the minimum viable integration (timing source for overlays)
4. **Optionally expose telemetry channels** (RPM, temps, accelerometer) for richer overlays later

---

## Open Questions

- What is the minimum data we need from XRK to serve as a timing source? (Likely just lap times + session start time)
- Should we support DRK as well, or is XRK-only sufficient for the target audience?
- Do we need GPS trace data for track map rendering, or is that a future concern?
- Licensing implications of referencing the reverse-engineered parser (TrackDataAnalysis uses GPL-3.0)

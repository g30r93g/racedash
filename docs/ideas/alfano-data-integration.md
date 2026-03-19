# Alfano Data Integration

**Date:** 2026-03-19
**Status:** Research
**Feeds into:** Timing source support, data import pipeline

---

## Context

Alfano is one of the most common data logging systems in karting alongside AIM/Mychron. Current devices include the Alfano 6 and Alfano 7. Integrating Alfano data would allow RaceDash users to import lap times, GPS traces, and telemetry from their Alfano loggers.

---

## File Formats

### `.alf` (legacy, VisualData software)

- **Type:** Proprietary binary format — no public documentation
- **Used by:** Older devices (Astro LV, Pro+ LV, Astro Formula, Vision, Pro+, ProIIIEVO) via VisualData 2.0 desktop software
- **No known open-source parser** for this binary format

### ZIP/CSV (modern, ADA app/software)

- **Type:** ZIP archive containing CSV text files
- **Used by:** Alfano 6, Alfano 7 via ADA mobile app (iOS/Android) and ADA PC software
- **Well-understood format** — reverse-engineered and documented by the OpenSourceRacingAnalytics project

**ZIP archive structure:**
```
ALFANO6_LAP_SN10298_130723_17H12_ALBERT_VIHTI_KARTING_1_6863/
  EEPROM_PAGE_16.dat                    (binary device parameters)
  PARAMETREALFANO6_LAP_SN10298_...dat   (binary device parameters, ~306 bytes)
  SN10298_130723_17H12_ALBERT_...csv    (session summary CSV)
  LAP_1_ALFANO6_LAP_SN10298_...csv      (per-lap telemetry CSV)
  LAP_2_ALFANO6_LAP_SN10298_...csv      (per-lap telemetry CSV)
  temps_moteur.csv                      (engine temperature data)
```

Naming convention encodes: device model, serial number, date, time, driver name, track name, session ID.

---

## Data Available

### Session Summary CSV

Header row fields include: `date, time, laps, track, driver, fastest_minutes, fastest_seconds, fastest_hundreds, device, samplerate, class, session_type`

Per-lap summary row fields: `lap, time_lap, time_partiel_1..6, Min_RPM, Max_RPM, Min_Speed_GPS, Max_Speed_GPS, Min_T1, Max_T1, Min_T2, Max_T2, Min_Speed_sensor, Max_Speed_sensor, Vbattery, max_EGT, Hdop`

### Per-Lap Telemetry CSV

Headers: `Partiel, RPM, Speed GPS, T1, T2, Gf. X, Gf. Y, Orientation, Speed rear, Lat., Lon., Altitude`

**Critical: Values are fixed-point integers** requiring decimal conversion:

| Channel | Conversion | Example |
|---|---|---|
| RPM | raw integer | 12500 → 12500 rpm |
| Speed GPS | ÷ 10 | 845 → 84.5 km/h |
| T1, T2 (temps) | ÷ 10 | 523 → 52.3°C |
| G-force X, Y | ÷ 1000, offset by 1000 | 1000 = 0g |
| Orientation/heading | ÷ 100 | 18045 → 180.45° |
| Speed rear | ÷ 10 | 830 → 83.0 km/h |
| Latitude, Longitude | ÷ 1,000,000 | 60364813 → 60.364813° |
| Altitude | ÷ 10 | 452 → 45.2m |

### Data Channels by Device

| Channel | Alfano 6 | Alfano 7 |
|---|---|---|
| Lap times (1/100s) | Yes | Yes |
| Sector/split times (up to 6) | Yes | Yes |
| GPS position (lat/lon) | Yes | Yes |
| GPS speed | Yes | Yes |
| GPS altitude | Yes | Yes |
| Heading/orientation | Yes | Yes |
| RPM | Yes | Yes |
| Temperature T1 (CHT/EGT) | Yes | Yes |
| Temperature T2 | Optional | 2T model |
| G-force lateral | Yes | Yes |
| G-force longitudinal | Yes | Yes |
| Rear wheel speed | Optional | Optional |
| Battery voltage | Yes | Yes |
| HDOP (GPS quality) | Yes | Yes |

**Sample rates:** Alfano 6 records at 10 Hz. Alfano 7 supports 10/20/25/50 Hz. ADA exports at up to 100 Hz.

---

## Alfano Software Ecosystem

| Software | Platform | Devices |
|---|---|---|
| **ADA PRO** | Windows (x86/x64) | Alfano 6, 7, ProIIIEVO, ADSGPS |
| **ADA** | Android / iOS | Same — Bluetooth transfer, CSV export at 100 Hz |
| **VisualData 2.0** | Windows | Legacy devices — exports `.alf`, `.xls`, `.csv` |

Data transfer: Bluetooth 4.0 (Alfano 6/7 → ADA app) or USB (older devices → VisualData).

---

## Open-Source Projects

| Project | Language | Notes |
|---|---|---|
| [OpenSourceRacingAnalytics](https://github.com/henrikingo/OpenSourceRacingAnalytics) | Python | **Best reference.** Full parser for Alfano 6 ZIP/CSV exports including all fixed-point conversions. Includes sample data. |
| [AlfanoReader](https://github.com/manuxcgit/AlfanoReader) | C# / Java | Reads Alfano data via serial — direct device communication, not file parsing. |

No official SDK or API from Alfano.

---

## Recommended Approach for RaceDash

1. **Target ADA ZIP/CSV exports** — text-based, well-understood, covers all modern Alfano devices
2. **Write a TypeScript parser** for the ZIP archive structure and CSV files with fixed-point conversion
3. **Start with lap times + GPS data** as minimum viable integration
4. **Skip `.alf` binary format** initially — legacy devices can export to CSV via VisualData anyway
5. **Reference implementation:** `OpenSourceRacingAnalytics/data-transfer/inout/Alfano.py`

---

## Open Questions

- Is ZIP/CSV export the only way users get data off Alfano 6/7, or can ADA export other formats?
- Do we need to handle the `.dat` parameter files inside the ZIP, or can we ignore them?
- Should we support the legacy `.alf` format at all, given VisualData can re-export to CSV?

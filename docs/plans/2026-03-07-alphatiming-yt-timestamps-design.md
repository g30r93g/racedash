# Alpha Timing → YouTube Timestamps Design

**Date:** 2026-03-07
**Status:** Approved (updated — HTML scraping approach)

---

## Overview

A Python CLI script that scrapes lap times for a named driver from an Alpha Timing results page (server-side rendered HTML), applies a user-supplied video offset, and outputs YouTube-format timestamps. Optionally pushes markers to an active DaVinci Resolve timeline.

---

## URL Format

Alpha Timing results follow the pattern:
```
https://results.alphatiming.co.uk/<club>/e/<event>/s/<session>/[result|laptimes|replay]
```

The `/laptimes` tab is server-side rendered — no JavaScript execution required. Requires a browser `User-Agent` header (returns 403 otherwise).

---

## Confirmed HTML Structure (from live inspection)

```
<table class="at-lap-chart-legend-table">
  <thead>
    <tr>
      <th>Click on a driver to remove / show on graph</th>
      <th>L1</th><th>L2</th>...<th>LN</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <div class="at-lap-chart-legend-table-competitor">
          <div style="background-color: ..."></div>  ← chart colour swatch
          <span>51</span>                             ← kart number
          <span>Reading C</span>                      ← driver/team name
        </div>
      </td>
      <td class="at-lap-chart-legend-table-laptime"><div class="">1:08.588</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class="at-laps-blor">1:04.776</div></td>  ← best lap
      <td class="at-lap-chart-legend-table-laptime"><div class=""></div></td>  ← empty = no lap
      ...
    </tr>
  </tbody>
</table>
```

**Key notes:**
- Lap times are strings in `M:SS.mmm` format (e.g. `1:08.588`)
- The HTML contains **no cumulative time** — must be calculated by summing individual laps
- Empty cells indicate the driver did not complete that lap
- Best lap has class `at-laps-blor` on the inner `<div>`

---

## Phase 1 Scope

### Modules

```
at_yt_timestamps/
├── main.py           # CLI entry point
├── alphatiming.py    # HTML scraper (httpx + BeautifulSoup4)
├── timestamps.py     # Lap → YouTube timestamp conversion
├── resolve.py        # DaVinci Resolve marker integration
└── requirements.txt  # httpx, beautifulsoup4
```

### CLI Interface

```bash
python main.py <alpha_timing_url> [driver_name] --offset HH:MM:SS [--resolve]
```

- `alpha_timing_url`: Full URL to any session tab — script normalises to `/laptimes` endpoint
- `driver_name` *(optional)*: Partial, case-insensitive match against team/driver name
- `--offset HH:MM:SS`: Time from video start to race start (e.g. `0:02:15`)
- `--resolve`: If passed, push markers to the active DaVinci Resolve timeline

**Driver selection behaviour:**

| Situation | Behaviour |
|-----------|-----------|
| Name given, unique match | Proceed directly |
| Name given, ambiguous | Show filtered numbered list, prompt to pick |
| No name given | Show full numbered driver list, prompt to pick |

### Data Model

```python
@dataclass
class Lap:
    number: int
    lap_time_s: float      # individual lap duration in seconds
    cumulative_s: float    # sum of all laps up to and including this one

@dataclass
class LapTimestamp:
    lap: Lap
    yt_seconds: float      # cumulative_s + offset_seconds
```

### Offset Calculation

```
yt_seconds = lap.cumulative_s + offset_seconds
```

Where `offset_seconds` = the point in the video where the driver crosses the start line for lap 1.

### Plain Text Output

```
Lap  1   1:23.456   0:02:15
Lap  2   1:24.123   0:03:38
Lap  3   1:22.891   0:05:03
...
```

Columns: lap number | lap time (M:SS.mmm) | YouTube timestamp (H:MM:SS)

### DaVinci Resolve Integration (`resolve.py`)

- Requires DaVinci Resolve to be running
- Connects via `DaVinciResolveScript` (bundled with Resolve, not pip-installable)
- Import path setup documented in README
- Gets current project + active timeline
- For each `LapTimestamp`, adds a **marker** at the corresponding frame:
  - Frame = `round(yt_seconds * timeline_fps)`
  - Label = `Lap N — M:SS.mmm`
  - Colour: cycles through Resolve's named colours

---

## Phase 2 (Future) — Gran Turismo-Style Overlay

A Fusion composition template with dynamic expressions:
- **Current lap timer**: counts up from 0:00.000 each lap
- **Previous laps list**: last 3 completed lap times
- **Delta**: difference vs previous lap (+/- M:SS.mmm)
- Visual style: GT7 HUD aesthetic

Requires:
1. A Fusion macro/template built manually in Resolve
2. Python scripting to place instances on the timeline and parameterise start frame + lap data

---

## Dependencies

| Package | Source | Purpose |
|---------|--------|---------|
| `httpx` | pip | HTTP client (with User-Agent header) |
| `beautifulsoup4` | pip | HTML parsing |
| `DaVinciResolveScript` | Resolve bundle | Resolve Python API (no pip install) |

---

## Success Criteria (Phase 1)

- [ ] Script fetches and parses the HTML laptimes table for a given session URL
- [ ] Driver matching works case-insensitively with partial name support
- [ ] Lap times are correctly parsed from `M:SS.mmm` string format to seconds
- [ ] Cumulative times are correctly calculated by summing individual laps
- [ ] YouTube timestamps are correctly calculated from the offset
- [ ] Plain text output matches expected format
- [ ] `--resolve` flag adds markers at correct frames on the active timeline

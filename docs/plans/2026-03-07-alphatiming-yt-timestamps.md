# Alpha Timing → YouTube Timestamps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Python CLI that scrapes lap times for a named driver from an Alpha Timing results page, applies a video offset, outputs YouTube timestamps, and optionally adds markers to a DaVinci Resolve timeline.

**Architecture:** The Alpha Timing `/laptimes` page is server-side rendered — no headless browser needed. `httpx` fetches the HTML with a browser User-Agent, `BeautifulSoup4` parses the `at-lap-chart-legend-table`, and the driver is selected interactively or by partial name match. The pipeline is: fetch → parse → select driver → calculate timestamps → output text (+ optional Resolve markers).

**Tech Stack:** Python 3.11+, `httpx` (HTTP), `beautifulsoup4` (HTML parsing), `pytest` (tests), `DaVinciResolveScript` (Resolve API — bundled with Resolve, not pip-installable)

---

## Confirmed HTML Structure

The live page at `https://results.alphatiming.co.uk/<club>/e/<event>/s/<session>/laptimes` renders:

```html
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
          <div style="background-color: ..."></div>  ← colour swatch (ignore)
          <span>51</span>                             ← kart number
          <span>Reading C</span>                      ← driver/team name ← match against this
        </div>
      </td>
      <td class="at-lap-chart-legend-table-laptime"><div class="">1:08.588</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class="at-laps-blor">1:04.776</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class=""></div></td>  ← empty = no lap
    </tr>
  </tbody>
</table>
```

Key notes:
- Lap time format: `M:SS.mmm` string (e.g. `1:08.588`)
- No cumulative time in HTML — calculate by summing
- Best lap has `at-laps-blor` class on inner div (informational only, not needed for parsing)
- Requires `User-Agent` header or server returns 403
- URL may point to any tab — normalise to `/laptimes` before fetching

---

## Task 1: Project Setup

**Files:**
- Create: `requirements.txt`
- Create: `requirements-dev.txt`
- Create: `at_yt_timestamps/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/fixtures/.gitkeep`
- Create: `pytest.ini`

**Step 1: Initialise git**

```bash
git init
git add .gitignore  # if it exists, otherwise skip
```

Create `.gitignore`:
```
.venv/
__pycache__/
*.pyc
.pytest_cache/
*.egg-info/
```

**Step 2: Create package structure**

```bash
mkdir -p at_yt_timestamps tests/fixtures
touch at_yt_timestamps/__init__.py tests/__init__.py tests/fixtures/.gitkeep
```

**Step 3: Create `requirements.txt`**

```
httpx>=0.27.0
beautifulsoup4>=4.12.0
```

**Step 4: Create `requirements-dev.txt`**

```
-r requirements.txt
pytest>=8.0.0
```

**Step 5: Create `pytest.ini`**

```ini
[pytest]
testpaths = tests
```

**Step 6: Create and activate a virtual environment**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

**Step 7: Verify pytest runs**

```bash
pytest --collect-only
```

Expected: `no tests ran`

**Step 8: Commit**

```bash
git add .gitignore requirements.txt requirements-dev.txt pytest.ini at_yt_timestamps/__init__.py tests/__init__.py tests/fixtures/.gitkeep
git commit -m "chore: project setup"
```

---

## Task 2: Lap Time String Parser

This is the lowest-level utility — parse `M:SS.mmm` strings into float seconds.

**Files:**
- Create: `at_yt_timestamps/parsing.py`
- Create: `tests/test_parsing.py`

**Step 1: Write the failing tests**

Create `tests/test_parsing.py`:

```python
import pytest
from at_yt_timestamps.parsing import parse_lap_time_str


def test_normal_lap_time():
    assert parse_lap_time_str("1:08.588") == pytest.approx(68.588)


def test_sub_minute_lap_time():
    assert parse_lap_time_str("0:45.100") == pytest.approx(45.1)


def test_exactly_one_minute():
    assert parse_lap_time_str("1:00.000") == pytest.approx(60.0)


def test_empty_string_returns_none():
    assert parse_lap_time_str("") is None


def test_whitespace_returns_none():
    assert parse_lap_time_str("   ") is None
```

**Step 2: Run to verify failure**

```bash
pytest tests/test_parsing.py -v
```

Expected: `ImportError: cannot import name 'parse_lap_time_str'`

**Step 3: Write minimal implementation**

Create `at_yt_timestamps/parsing.py`:

```python
def parse_lap_time_str(s: str) -> float | None:
    """Parse a lap time string 'M:SS.mmm' into total seconds. Returns None if empty."""
    s = s.strip()
    if not s:
        return None
    minutes, rest = s.split(":")
    seconds = float(rest)
    return int(minutes) * 60 + seconds
```

**Step 4: Run to verify passing**

```bash
pytest tests/test_parsing.py -v
```

Expected: 5 PASSED

**Step 5: Commit**

```bash
git add at_yt_timestamps/parsing.py tests/test_parsing.py
git commit -m "feat: add lap time string parser"
```

---

## Task 3: Data Models

**Files:**
- Create: `at_yt_timestamps/models.py`
- Create: `tests/test_models.py`

**Step 1: Write failing tests**

Create `tests/test_models.py`:

```python
from at_yt_timestamps.models import Lap, LapTimestamp


def test_lap_fields():
    lap = Lap(number=1, lap_time_s=68.588, cumulative_s=68.588)
    assert lap.number == 1
    assert lap.lap_time_s == 68.588
    assert lap.cumulative_s == 68.588


def test_lap_timestamp_fields():
    lap = Lap(number=1, lap_time_s=68.588, cumulative_s=68.588)
    ts = LapTimestamp(lap=lap, yt_seconds=203.588)
    assert ts.lap is lap
    assert ts.yt_seconds == 203.588
```

**Step 2: Run to verify failure**

```bash
pytest tests/test_models.py -v
```

Expected: `ImportError`

**Step 3: Write minimal implementation**

Create `at_yt_timestamps/models.py`:

```python
from dataclasses import dataclass


@dataclass
class Lap:
    number: int
    lap_time_s: float
    cumulative_s: float


@dataclass
class LapTimestamp:
    lap: Lap
    yt_seconds: float
```

**Step 4: Run to verify passing**

```bash
pytest tests/test_models.py -v
```

Expected: 2 PASSED

**Step 5: Commit**

```bash
git add at_yt_timestamps/models.py tests/test_models.py
git commit -m "feat: add Lap and LapTimestamp data models"
```

---

## Task 4: HTML Scraper

Parse driver rows from the Alpha Timing laptimes HTML. Tests use an inline HTML fixture — no live network required.

**Files:**
- Create: `at_yt_timestamps/alphatiming.py`
- Create: `tests/fixtures/laptimes_sample.html`
- Create: `tests/test_alphatiming.py`

**Step 1: Create the HTML fixture**

Create `tests/fixtures/laptimes_sample.html` — a minimal but realistic snippet:

```html
<table class="at-lap-chart-legend-table">
  <thead>
    <tr>
      <th>Click on a driver to remove / show on graph</th>
      <th>L1</th><th>L2</th><th>L3</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <div class="at-lap-chart-legend-table-competitor" onclick="toggleCompetitor(0, this)">
          <div style="background-color: rgb(49,130,189); width: 20px; height: 20px;">&nbsp;</div>
          <span>51</span>
          <span>Reading C</span>
        </div>
      </td>
      <td class="at-lap-chart-legend-table-laptime"><div class="">1:08.588</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class="at-laps-blor">1:04.776</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class="">1:05.218</div></td>
    </tr>
    <tr>
      <td>
        <div class="at-lap-chart-legend-table-competitor" onclick="toggleCompetitor(1, this)">
          <div style="background-color: rgb(107,174,214); width: 20px; height: 20px;">&nbsp;</div>
          <span>81</span>
          <span>Surrey C</span>
        </div>
      </td>
      <td class="at-lap-chart-legend-table-laptime"><div class="">1:09.812</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class="">1:06.729</div></td>
      <td class="at-lap-chart-legend-table-laptime"><div class=""></div></td>
    </tr>
  </tbody>
</table>
```

**Step 2: Write failing tests**

Create `tests/test_alphatiming.py`:

```python
import pytest
from pathlib import Path
from at_yt_timestamps.alphatiming import parse_drivers, DriverRow
from at_yt_timestamps.models import Lap

FIXTURE = Path(__file__).parent / "fixtures" / "laptimes_sample.html"


@pytest.fixture
def sample_html():
    return FIXTURE.read_text()


def test_parse_drivers_count(sample_html):
    drivers = parse_drivers(sample_html)
    assert len(drivers) == 2


def test_parse_driver_name(sample_html):
    drivers = parse_drivers(sample_html)
    assert drivers[0].name == "Reading C"
    assert drivers[1].name == "Surrey C"


def test_parse_driver_kart_number(sample_html):
    drivers = parse_drivers(sample_html)
    assert drivers[0].kart == "51"


def test_parse_driver_laps(sample_html):
    drivers = parse_drivers(sample_html)
    laps = drivers[0].laps
    assert len(laps) == 3
    assert laps[0] == Lap(number=1, lap_time_s=pytest.approx(68.588), cumulative_s=pytest.approx(68.588))
    assert laps[1] == Lap(number=2, lap_time_s=pytest.approx(64.776), cumulative_s=pytest.approx(133.364))
    assert laps[2] == Lap(number=3, lap_time_s=pytest.approx(65.218), cumulative_s=pytest.approx(198.582))


def test_parse_driver_laps_skips_empty_cells(sample_html):
    drivers = parse_drivers(sample_html)
    # Surrey C has an empty 3rd cell — only 2 laps
    assert len(drivers[1].laps) == 2


def test_parse_cumulative_is_running_sum(sample_html):
    drivers = parse_drivers(sample_html)
    laps = drivers[1].laps
    assert laps[0].cumulative_s == pytest.approx(69.812)
    assert laps[1].cumulative_s == pytest.approx(69.812 + 66.729)
```

**Step 3: Run to verify failure**

```bash
pytest tests/test_alphatiming.py -v
```

Expected: `ImportError: cannot import name 'parse_drivers'`

**Step 4: Write minimal implementation**

Create `at_yt_timestamps/alphatiming.py`:

```python
from dataclasses import dataclass
from bs4 import BeautifulSoup
import httpx

from at_yt_timestamps.models import Lap
from at_yt_timestamps.parsing import parse_lap_time_str

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)


@dataclass
class DriverRow:
    kart: str
    name: str
    laps: list[Lap]


def fetch_html(url: str) -> str:
    """Fetch the Alpha Timing laptimes page HTML."""
    laptimes_url = _normalise_url(url)
    with httpx.Client() as client:
        response = client.get(laptimes_url, headers={"User-Agent": _USER_AGENT})
        response.raise_for_status()
        return response.text


def parse_drivers(html: str) -> list[DriverRow]:
    """Parse all driver rows from the laptimes HTML."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="at-lap-chart-legend-table")
    if table is None:
        raise ValueError("Could not find laptimes table in the page HTML.")

    rows = table.find("tbody").find_all("tr")
    return [_parse_row(row) for row in rows]


def _parse_row(row) -> DriverRow:
    cells = row.find_all("td")
    competitor = cells[0].find("div", class_="at-lap-chart-legend-table-competitor")
    spans = competitor.find_all("span")
    kart = spans[0].get_text(strip=True)
    name = spans[1].get_text(strip=True)

    laps = []
    cumulative = 0.0
    for i, cell in enumerate(cells[1:], start=1):
        text = cell.find("div").get_text(strip=True)
        lap_time_s = parse_lap_time_str(text)
        if lap_time_s is None:
            continue  # empty cell — driver didn't complete this lap
        cumulative = round(cumulative + lap_time_s, 3)
        laps.append(Lap(number=i, lap_time_s=lap_time_s, cumulative_s=cumulative))

    return DriverRow(kart=kart, name=name, laps=laps)


def _normalise_url(url: str) -> str:
    """Ensure the URL points to the /laptimes tab."""
    tabs = ["/result", "/laptimes", "/lapchart", "/replay", "/grid"]
    for tab in tabs:
        if url.endswith(tab):
            base = url[: -len(tab)]
            return f"{base}/laptimes"
    # No known tab suffix — append /laptimes
    return url.rstrip("/") + "/laptimes"
```

**Step 5: Run to verify passing**

```bash
pytest tests/test_alphatiming.py -v
```

Expected: All 6 PASSED

**Step 6: Run full suite**

```bash
pytest -v
```

Expected: All tests pass

**Step 7: Commit**

```bash
git add at_yt_timestamps/alphatiming.py tests/test_alphatiming.py tests/fixtures/laptimes_sample.html
git commit -m "feat: add HTML scraper for Alpha Timing laptimes table"
```

---

## Task 5: Interactive Driver Selection

**Files:**
- Create: `at_yt_timestamps/selection.py`
- Create: `tests/test_selection.py`

**Step 1: Write failing tests**

Create `tests/test_selection.py`:

```python
import pytest
from at_yt_timestamps.alphatiming import DriverRow
from at_yt_timestamps.models import Lap
from at_yt_timestamps.selection import resolve_driver


def _make_driver(name: str) -> DriverRow:
    return DriverRow(kart="1", name=name, laps=[])


DRIVERS = [
    _make_driver("Reading C"),
    _make_driver("Surrey C"),
    _make_driver("Oxford A"),
]


def test_exact_match_returns_directly():
    result = resolve_driver(DRIVERS, query="Surrey C")
    assert result.name == "Surrey C"


def test_partial_match_unique_returns_directly():
    result = resolve_driver(DRIVERS, query="oxford")
    assert result.name == "Oxford A"


def test_no_query_prompts_from_full_list(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda _: "2")
    result = resolve_driver(DRIVERS, query=None)
    assert result.name == "Surrey C"


def test_ambiguous_query_prompts_from_filtered_list(monkeypatch):
    # "C" matches Reading C and Surrey C
    monkeypatch.setattr("builtins.input", lambda _: "1")
    result = resolve_driver(DRIVERS, query="C")
    # First match in filtered list is Reading C
    assert result.name == "Reading C"


def test_no_match_raises():
    with pytest.raises(ValueError, match="No drivers found matching"):
        resolve_driver(DRIVERS, query="Ferrari")


def test_selection_out_of_range_re_prompts(monkeypatch):
    responses = iter(["99", "1"])
    monkeypatch.setattr("builtins.input", lambda _: next(responses))
    result = resolve_driver(DRIVERS, query=None)
    assert result.name == "Reading C"
```

**Step 2: Run to verify failure**

```bash
pytest tests/test_selection.py -v
```

Expected: `ImportError`

**Step 3: Write minimal implementation**

Create `at_yt_timestamps/selection.py`:

```python
from at_yt_timestamps.alphatiming import DriverRow


def resolve_driver(drivers: list[DriverRow], query: str | None) -> DriverRow:
    """Return the selected driver, prompting interactively if needed."""
    candidates = _filter(drivers, query)

    if len(candidates) == 1:
        return candidates[0]

    return _prompt(candidates)


def _filter(drivers: list[DriverRow], query: str | None) -> list[DriverRow]:
    if query is None:
        return drivers
    q = query.lower()
    matches = [d for d in drivers if q in d.name.lower()]
    if not matches:
        available = ", ".join(d.name for d in drivers)
        raise ValueError(
            f"No drivers found matching '{query}'. Available: {available}"
        )
    return matches


def _prompt(candidates: list[DriverRow]) -> DriverRow:
    """Print numbered list and ask user to pick one."""
    print("\nDrivers:")
    for i, d in enumerate(candidates, start=1):
        print(f"  {i:2d}. [{d.kart:>3}] {d.name}")

    while True:
        raw = input("\nSelect driver number: ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(candidates):
            return candidates[int(raw) - 1]
        print(f"  Please enter a number between 1 and {len(candidates)}.")
```

**Step 4: Run to verify passing**

```bash
pytest tests/test_selection.py -v
```

Expected: All 6 PASSED

**Step 5: Commit**

```bash
git add at_yt_timestamps/selection.py tests/test_selection.py
git commit -m "feat: add interactive driver selection"
```

---

## Task 6: Timestamp Calculator

**Files:**
- Create: `at_yt_timestamps/timestamps.py`
- Create: `tests/test_timestamps.py`

**Step 1: Write failing tests**

Create `tests/test_timestamps.py`:

```python
import pytest
from at_yt_timestamps.models import Lap, LapTimestamp
from at_yt_timestamps.timestamps import (
    parse_offset,
    calculate_timestamps,
    format_yt_timestamp,
    format_lap_time,
)


# --- parse_offset ---

def test_parse_offset_minutes_seconds():
    assert parse_offset("2:15") == pytest.approx(135.0)


def test_parse_offset_hours_minutes_seconds():
    assert parse_offset("0:02:15") == pytest.approx(135.0)


def test_parse_offset_with_decimal_seconds():
    assert parse_offset("1:23.5") == pytest.approx(83.5)


def test_parse_offset_zero():
    assert parse_offset("0:00") == pytest.approx(0.0)


def test_parse_offset_invalid_raises():
    with pytest.raises(ValueError, match="Invalid offset"):
        parse_offset("not-a-time")


# --- calculate_timestamps ---

def test_calculate_timestamps_applies_offset():
    laps = [
        Lap(number=1, lap_time_s=68.588, cumulative_s=68.588),
        Lap(number=2, lap_time_s=64.776, cumulative_s=133.364),
    ]
    result = calculate_timestamps(laps, offset_seconds=135.0)
    assert result[0].yt_seconds == pytest.approx(68.588 + 135.0)
    assert result[1].yt_seconds == pytest.approx(133.364 + 135.0)


def test_calculate_timestamps_preserves_lap_reference():
    lap = Lap(number=1, lap_time_s=68.588, cumulative_s=68.588)
    result = calculate_timestamps([lap], offset_seconds=0.0)
    assert result[0].lap is lap


# --- format_yt_timestamp ---

def test_format_yt_under_one_hour():
    assert format_yt_timestamp(135.0) == "2:15"


def test_format_yt_over_one_hour():
    assert format_yt_timestamp(3661.0) == "1:01:01"


def test_format_yt_truncates_sub_seconds():
    # YouTube timestamps don't use sub-second precision
    assert format_yt_timestamp(83.9) == "1:23"


# --- format_lap_time ---

def test_format_lap_time():
    assert format_lap_time(68.588) == "1:08.588"


def test_format_lap_time_sub_minute():
    assert format_lap_time(45.1) == "0:45.100"


def test_format_lap_time_rounding():
    assert format_lap_time(60.0) == "1:00.000"
```

**Step 2: Run to verify failure**

```bash
pytest tests/test_timestamps.py -v
```

Expected: `ImportError`

**Step 3: Write minimal implementation**

Create `at_yt_timestamps/timestamps.py`:

```python
from at_yt_timestamps.models import Lap, LapTimestamp


def parse_offset(offset_str: str) -> float:
    """Parse H:MM:SS, M:SS, or M:SS.mmm into total seconds."""
    parts = offset_str.split(":")
    if len(parts) == 2:
        hours, minutes, rest = 0, parts[0], parts[1]
    elif len(parts) == 3:
        hours, minutes, rest = parts[0], parts[1], parts[2]
    else:
        raise ValueError(f"Invalid offset '{offset_str}'. Use H:MM:SS or M:SS.")
    try:
        return int(hours) * 3600 + int(minutes) * 60 + float(rest)
    except ValueError:
        raise ValueError(f"Invalid offset '{offset_str}'. Use H:MM:SS or M:SS.")


def calculate_timestamps(laps: list[Lap], offset_seconds: float) -> list[LapTimestamp]:
    """Add offset to each lap's cumulative time to produce YouTube timestamps."""
    return [
        LapTimestamp(lap=lap, yt_seconds=round(lap.cumulative_s + offset_seconds, 3))
        for lap in laps
    ]


def format_yt_timestamp(seconds: float) -> str:
    """Format seconds as H:MM:SS or M:SS (no sub-seconds — YouTube format)."""
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def format_lap_time(seconds: float) -> str:
    """Format seconds as M:SS.mmm."""
    total_ms = round(seconds * 1000)
    ms = total_ms % 1000
    total_s = total_ms // 1000
    m = total_s // 60
    s = total_s % 60
    return f"{m}:{s:02d}.{ms:03d}"
```

**Step 4: Run to verify passing**

```bash
pytest tests/test_timestamps.py -v
```

Expected: All 12 PASSED

**Step 5: Commit**

```bash
git add at_yt_timestamps/timestamps.py tests/test_timestamps.py
git commit -m "feat: add timestamp calculator and formatters"
```

---

## Task 7: Text Output Formatter

**Files:**
- Create: `at_yt_timestamps/output.py`
- Create: `tests/test_output.py`

**Step 1: Write failing tests**

Create `tests/test_output.py`:

```python
from at_yt_timestamps.models import Lap, LapTimestamp
from at_yt_timestamps.output import format_text_output


def test_format_output_two_laps():
    timestamps = [
        LapTimestamp(lap=Lap(number=1, lap_time_s=68.588, cumulative_s=68.588), yt_seconds=203.588),
        LapTimestamp(lap=Lap(number=2, lap_time_s=64.776, cumulative_s=133.364), yt_seconds=268.364),
    ]
    result = format_text_output(timestamps)
    lines = result.strip().split("\n")
    assert len(lines) == 2
    assert lines[0] == "Lap  1   1:08.588   3:23"
    assert lines[1] == "Lap  2   1:04.776   4:28"


def test_format_output_empty():
    assert format_text_output([]) == ""
```

**Step 2: Run to verify failure**

```bash
pytest tests/test_output.py -v
```

Expected: `ImportError`

**Step 3: Write minimal implementation**

Create `at_yt_timestamps/output.py`:

```python
from at_yt_timestamps.models import LapTimestamp
from at_yt_timestamps.timestamps import format_lap_time, format_yt_timestamp


def format_text_output(timestamps: list[LapTimestamp]) -> str:
    """Format lap timestamps as a plain text list for YouTube descriptions."""
    if not timestamps:
        return ""
    return "\n".join(
        f"Lap {ts.lap.number:2d}   {format_lap_time(ts.lap.lap_time_s)}   {format_yt_timestamp(ts.yt_seconds)}"
        for ts in timestamps
    )
```

**Step 4: Run to verify passing**

```bash
pytest tests/test_output.py -v
```

Expected: 2 PASSED

**Step 5: Run full suite**

```bash
pytest -v
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add at_yt_timestamps/output.py tests/test_output.py
git commit -m "feat: add plain text output formatter"
```

---

## Task 8: CLI Entry Point

**Files:**
- Create: `main.py`

No automated tests — verify manually in Step 3.

**Step 1: Write `main.py`**

```python
#!/usr/bin/env python3
import argparse
import sys

from at_yt_timestamps.alphatiming import fetch_html, parse_drivers
from at_yt_timestamps.selection import resolve_driver
from at_yt_timestamps.timestamps import parse_offset, calculate_timestamps
from at_yt_timestamps.output import format_text_output


def main():
    parser = argparse.ArgumentParser(
        description="Convert Alpha Timing lap times to YouTube timestamps."
    )
    parser.add_argument("url", help="Alpha Timing session URL (any tab)")
    parser.add_argument(
        "driver",
        nargs="?",
        default=None,
        help="Driver/team name (optional — shows interactive list if omitted)",
    )
    parser.add_argument(
        "--offset",
        required=True,
        metavar="H:MM:SS",
        help="Video timestamp at race start, e.g. 0:02:15",
    )
    parser.add_argument(
        "--resolve",
        action="store_true",
        help="Push markers to the active DaVinci Resolve timeline",
    )
    args = parser.parse_args()

    try:
        offset_s = parse_offset(args.offset)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print("Fetching laptimes...", file=sys.stderr)
    try:
        html = fetch_html(args.url)
    except Exception as e:
        print(f"Error fetching page: {e}", file=sys.stderr)
        sys.exit(1)

    drivers = parse_drivers(html)
    if not drivers:
        print("No driver data found on this page.", file=sys.stderr)
        sys.exit(1)

    try:
        driver = resolve_driver(drivers, args.driver)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\nDriver: [{driver.kart}] {driver.name} — {len(driver.laps)} laps\n", file=sys.stderr)

    timestamps = calculate_timestamps(driver.laps, offset_s)
    print(format_text_output(timestamps))

    if args.resolve:
        try:
            from at_yt_timestamps.resolve import push_markers
            push_markers(timestamps)
        except ImportError:
            print(
                "\nWarning: DaVinci Resolve scripting API not available. "
                "See docs/resolve-setup.md for setup.",
                file=sys.stderr,
            )


if __name__ == "__main__":
    main()
```

**Step 2: Make executable**

```bash
chmod +x main.py
```

**Step 3: Manual smoke test**

Run against the known live URL:

```bash
python main.py "https://results.alphatiming.co.uk/bukc/e/358384/s/741345/laptimes" --offset 0:02:15
```

Expected: numbered driver list appears, you select one, timestamps are printed.

Also test with a partial name (no interactive prompt):

```bash
python main.py "https://results.alphatiming.co.uk/bukc/e/358384/s/741345/result" "Reading" --offset 0:02:15
```

The URL ends in `/result` — the script should normalise it to `/laptimes` and proceed.

**Step 4: Commit**

```bash
git add main.py
git commit -m "feat: add CLI entry point"
```

---

## Task 9: DaVinci Resolve Integration

> ⚠️ **Prerequisite:** DaVinci Resolve must be installed and running. `DaVinciResolveScript` is not pip-installable — it ships with Resolve.

**Files:**
- Create: `at_yt_timestamps/resolve.py`
- Create: `docs/resolve-setup.md`

**Step 1: Create `docs/resolve-setup.md`**

```markdown
# DaVinci Resolve Python API Setup

## macOS

Add to `~/.zshrc`:

```bash
export PYTHONPATH="$PYTHONPATH:/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"
```

Then reload: `source ~/.zshrc`

## Requirements

- DaVinci Resolve must be **running**
- A project with a timeline must be open
- The timeline's frame rate must match your video

## Usage

```bash
python main.py <url> "<driver>" --offset 0:02:15 --resolve
```

The script will add a marker at each lap's YouTube timestamp on the active timeline.
Frame calculation: `frame = round(yt_seconds * timeline_fps)`
```

**Step 2: Write `resolve.py`**

No automated tests — requires live Resolve. Verify manually in Step 3.

Create `at_yt_timestamps/resolve.py`:

```python
"""DaVinci Resolve integration — adds timeline markers at each lap timestamp.

Requires DaVinci Resolve to be running and DaVinciResolveScript on PYTHONPATH.
See docs/resolve-setup.md.
"""
import sys
from at_yt_timestamps.models import LapTimestamp
from at_yt_timestamps.timestamps import format_lap_time, format_yt_timestamp

_COLOURS = ["Cream", "Sky", "Mint", "Rose", "Lavender", "Sand"]


def push_markers(timestamps: list[LapTimestamp]) -> None:
    """Add a timeline marker for each lap to the active Resolve timeline."""
    resolve = _connect()
    project = resolve.GetProjectManager().GetCurrentProject()
    if project is None:
        raise RuntimeError("No project open in DaVinci Resolve.")
    timeline = project.GetCurrentTimeline()
    if timeline is None:
        raise RuntimeError("No timeline active in DaVinci Resolve.")

    fps = float(timeline.GetSetting("timelineFrameRate"))

    for i, ts in enumerate(timestamps):
        frame = int(round(ts.yt_seconds * fps))
        colour = _COLOURS[i % len(_COLOURS)]
        label = f"Lap {ts.lap.number} — {format_lap_time(ts.lap.lap_time_s)}"
        timeline.AddMarker(frame, colour, label, "", 1, "")
        print(f"  Marker: frame {frame:6d}  {format_yt_timestamp(ts.yt_seconds):>8}  {label}")

    print(f"\nAdded {len(timestamps)} markers to '{timeline.GetName()}'.")


def _connect():
    try:
        import DaVinciResolveScript as dvr
    except ImportError:
        print("DaVinciResolveScript not found. See docs/resolve-setup.md.", file=sys.stderr)
        raise
    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        raise RuntimeError("Could not connect to DaVinci Resolve. Is it running?")
    return resolve
```

**Step 3: Manual test with Resolve**

1. Open DaVinci Resolve with a project and timeline loaded
2. Set PYTHONPATH per `docs/resolve-setup.md`
3. Run:
   ```bash
   python main.py "<url>" "Reading" --offset 0:02:15 --resolve
   ```
4. Check Resolve timeline for markers at the expected positions

**Step 4: Commit**

```bash
git add at_yt_timestamps/resolve.py docs/resolve-setup.md
git commit -m "feat: add DaVinci Resolve marker integration"
```

---

## Task 10: Final Polish — README

**Files:**
- Create: `README.md`

**Step 1: Run full test suite**

```bash
pytest -v
```

Expected: All tests pass.

**Step 2: Create `README.md`**

```markdown
# Alpha Timing → YouTube Timestamps

Fetch lap times from Alpha Timing, apply a video offset, and print YouTube timestamps.
Optionally adds markers to a DaVinci Resolve timeline.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

```bash
python main.py <alpha_timing_url> [driver_name] --offset H:MM:SS [--resolve]
```

**`driver_name` is optional.** If omitted (or if multiple drivers match), an interactive
numbered list is shown.

### Examples

```bash
# Interactive driver selection
python main.py "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" --offset 0:02:15

# Direct match (partial name, case-insensitive)
python main.py "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" "reading" --offset 0:02:15

# With DaVinci Resolve markers
python main.py "https://..." "reading" --offset 0:02:15 --resolve
```

### Output

```
Lap  1   1:08.588   3:23
Lap  2   1:04.776   4:28
Lap  3   1:05.218   5:33
```

Columns: lap number | individual lap time | YouTube timestamp

### `--offset` explained

The offset is the video timestamp when the driver crosses the start line for lap 1.
Example: if the video starts in the pits and the car begins lap 1 at 2:15 into the video,
use `--offset 0:02:15`.

## DaVinci Resolve

See [docs/resolve-setup.md](docs/resolve-setup.md).

## Development

```bash
pip install -r requirements-dev.txt
pytest -v
```
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Task Summary

| # | Task | Testing |
|---|------|---------|
| 1 | Project setup | `pytest --collect-only` |
| 2 | Lap time string parser | Unit tests |
| 3 | Data models | Unit tests |
| 4 | HTML scraper | Unit tests with HTML fixture |
| 5 | Interactive driver selection | Unit tests (monkeypatch input) |
| 6 | Timestamp calculator | Unit tests |
| 7 | Text output formatter | Unit tests |
| 8 | CLI entry point | Manual smoke test |
| 9 | DaVinci Resolve integration | Manual with Resolve running |
| 10 | README | `pytest -v` + read the README |

> No mitmproxy step needed — the page is server-side rendered and the HTML structure is fully documented above.

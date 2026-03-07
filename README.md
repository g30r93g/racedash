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

e Timestaetcps

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
3:23   Lap  1   1:08.588
4:28   Lap  2   1:04.776
5:33   Lap  3   1:05.218
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

---

## racedash (TypeScript CLI)

### System requirements

- Node.js 20+
- pnpm
- FFmpeg (required for the `render` subcommand)

### Installation

```bash
pnpm install
```

### Build

```bash
pnpm turbo build
```

### Usage

#### `racedash drivers <url>`

Lists all drivers and karts found in the Alpha Timing session.

```bash
racedash drivers "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes"
```

#### `racedash timestamps <url> [driver] --offset <M:SS>`

Outputs YouTube chapter timestamps to stdout.

```bash
racedash timestamps "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" "reading" --offset 2:15
```

| Flag | Description | Default |
|------|-------------|---------|
| `--offset <M:SS>` | Time in `M:SS` (or `H:MM:SS`) from video start to the first lap | _(required)_ |

#### `racedash render <url> [driver] --offset <M:SS> --video <path> [options]`

Renders a GT7-style lap timer overlay onto source footage.

```bash
racedash render "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" "reading" \
  --offset 2:15 \
  --video ./race.mp4 \
  --output ./race-out.mp4
```

| Flag | Description | Default |
|------|-------------|---------|
| `--offset <M:SS>` | Time offset (`M:SS` or `H:MM:SS`) from video start to the first lap | _(required)_ |
| `--video <path>` | Path to source video file | _(required)_ |
| `--style <name>` | Overlay style | `gt7` |
| `--output <path>` | Output path | `./out.mp4` |
| `--fps <n>` | Output framerate | `60` |
| `--overlay-x <n>` | Overlay X position in pixels | `0` |
| `--overlay-y <n>` | Overlay Y position in pixels | `0` |

### Driver selection

If `[driver]` is omitted or the name matches multiple drivers, an interactive numbered selection prompt is shown.

### Running tests

```bash
pnpm turbo test
```

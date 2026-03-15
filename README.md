# racedash

Fetch timing data from multiple sources, generate YouTube chapter timestamps, and render lap timer overlays onto race footage.

---

## Quick start (for everyone)

### 1. Install prerequisites

You'll need three tools installed before you can run racedash. Follow the instructions for your operating system.

#### Node.js (v20 or later)

Download and run the installer from **https://nodejs.org** — choose the "LTS" version.

To check it worked, open a terminal and run:
```
node --version
```
You should see something like `v20.x.x`.

#### pnpm (package manager)

Once Node.js is installed, run this in your terminal:
```
npm install -g pnpm
```

#### FFmpeg (required for the `render` command)

**macOS** — if you have [Homebrew](https://brew.sh):
```
brew install ffmpeg
```

**Windows** — if you have [Winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/):
```
winget install ffmpeg
```

Windows support for `racedash render` is currently experimental. The Windows render path uses a transparent VP9 WebM overlay internally, so you do not need ProRes support installed on your machine.

**Linux:**
```
sudo apt install ffmpeg
```

---

### 2. Download racedash

If you have Git installed:
```
git clone https://github.com/your-org/racedash.git
cd racedash
```

Or download the ZIP from GitHub, unzip it, and open a terminal in the folder.

---

### 3. Install dependencies

Inside the racedash folder, run:
```
pnpm install
```

---

### 4. Run a command

All commands follow this pattern:
```
pnpm racedash <command> [options]
```

See the **Commands** section below for what you can do.

---

## Commands

### Config-first workflow

`racedash` now reads timing data from a JSON config file for `drivers`, `timestamps`, and `render`.

Each segment must declare an explicit `source`. v1 sources are:

- `alphaTiming`
- `teamsportEmail`
- `daytona`
- `manual`

Example config:

```json
{
  "driver": "Surrey A",
  "segments": [
    {
      "source": "alphaTiming",
      "mode": "practice",
      "url": "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes",
      "offset": "2:15.000",
      "label": "Practice"
    },
    {
      "source": "teamsportEmail",
      "mode": "qualifying",
      "emailPath": "./results/teamsport-session.eml",
      "offset": "17:42.500",
      "label": "Qualifying"
    },
    {
      "source": "daytona",
      "mode": "race",
      "url": "https://speedhive.mylaps.com/sessions/11791523",
      "offset": "31:05.000",
      "label": "Race"
    },
    {
      "source": "manual",
      "mode": "race",
      "offset": "1:05:30.000",
      "label": "Fallback",
      "timingData": [
        { "lap": 0, "time": "0:14.500" },
        { "lap": 1, "time": "1:02.115" },
        { "lap": 2, "time": "1:01.884" }
      ]
    }
  ]
}
```

---

### `racedash drivers --config <path>`

Lists drivers discovered across the configured segments. If every segment resolves the same driver list, racedash prints one shared list; otherwise it prints segment-specific lists. When a source lacks full driver discovery, racedash reports that in the feature checklist.

```bash
pnpm racedash drivers --config ./session.json
pnpm racedash drivers --config ./session.json --driver "Surrey A"
```

| Flag | Description | Required |
|------|-------------|----------|
| `--config <path>` | Path to the session config JSON | Yes |
| `--driver <name>` | Driver name to highlight in the printed list | No |

---

### `racedash timestamps --config <path>`

Prints YouTube chapter timestamps to your terminal. Copy and paste the output into your YouTube video description.

```bash
pnpm racedash timestamps --config ./session.json
pnpm racedash timestamps --config ./session.json --fps 60
```

`config.driver` is required for `timestamps` because racedash needs one selected driver per segment.

| Flag | Description | Required |
|------|-------------|----------|
| `--config <path>` | Path to the session config JSON | Yes |
| `--fps <n>` | Video fps used when any segment offset is given as a frame count like `12345 F` | No |

**Example output:**
```
3:23   Lap  1   1:08.588
4:28   Lap  2   1:04.776
5:33   Lap  3   1:05.218
```

#### What is `offset`?

It is the point in your video where the segment starts. For most segments that means the selected driver crosses the line to begin lap 1. Manual timing data may also start at lap `0`, which represents a formation/pre-start lap before lap 1.

If you have a frame number instead of a timestamp, you can use values like `"12345 F"` in the config and pass `--fps 60` to the command.

---

### `racedash join <files...>`

Joins multiple GoPro chapter files into a single video (lossless — no re-encoding).

```bash
pnpm racedash join GH010001.MP4 GH020001.MP4 GH030001.MP4 --output race.mp4
```

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Where to save the joined file | `./joined.mp4` |

---

### `racedash doctor`

Inspects your machine and FFmpeg setup for rendering. This is useful when reporting Windows compatibility issues because it prints the detected CPU, GPU, available FFmpeg hardware acceleration backends, relevant encoders, and the current default render strategy.

```bash
pnpm racedash doctor
```

---

### `racedash render --config <path> --video <path>`

Renders a lap timer overlay onto your video. This takes a few minutes depending on video length.

On Windows, `render` support is experimental. racedash will print a warning at startup, probe your FFmpeg and hardware setup, and fall back to software decoding when the preferred hardware path does not validate.

```bash
pnpm racedash render --config ./session.json \
  --video ./race.mp4 \
  --output ./race-out.mp4
```

While running, racedash shows a progress bar for each step and a total time on completion:

```
  Fetching session data and probing video...

  Driver      Jane Smith  [43]  ·  26 laps
  Mode        qualifying
  Video       1920×1080  ·  60 fps
  Style       banner
  Accent      ██ #3DD73D
  Text        ██ white
  Timer text  ██ white
  Timer bg    ██ #111111

  Rendering overlay   [████████████████░░░░░░░░░░░░░░]   54%  ETA 1:12
  Compositing         [████████████████████████████░░]   93%  ETA 0:08

  ✓  ./race-out.mp4  ·  3:42
```

#### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to the session config JSON | _(required)_ |
| `--video <path>` | Path to your source video file | _(required)_ |
| `--output <path>` | Where to save the rendered video | `./out.mp4` |
| `--style <name>` | Overlay style (see below) | `banner` |
| `--overlay-x <n>` | Horizontal position of the overlay in pixels | `0` |
| `--overlay-y <n>` | Vertical position of the overlay in pixels | `0` |
| `--box-position <pos>` | Position for `esports`, `minimal`, and `modern`: `bottom-left`, `bottom-center`, `bottom-right`, `top-left`, `top-center`, `top-right` | `bottom-left` for `esports`/`minimal`, `bottom-center` for `modern` |
| `--output-resolution <preset>` | Output resolution preset: `1080p`, `1440p`, or `2160p` | _(video resolution)_ |
| `--qualifying-table-position <pos>` | Corner for the qualifying table: `bottom-left`, `bottom-right`, `top-left`, `top-right` | _(config/default)_ |
| `--label-window <seconds>` | Seconds before/after a segment offset to show its label | `15` |
| `--no-cache` | Force the overlay to be re-rendered instead of reusing a cached render | `false` |
| `--only-render-overlay` | Render the overlay file and skip compositing it onto the source video | `false` |

#### Available styles

| Style | Description |
|-------|-------------|
| `banner` | Full-width top strip with a coloured accent band and a dark centre trap for the lap timer. In `practice`/`qualifying` mode the band also shows last-lap and session-best panels; in `race` mode it shows a position counter and lap fraction at the edges. Flashes purple/green/red on lap completion. Colours are fully configurable via `--accent-color`, `--text-color`, `--timer-text-color`, and `--timer-bg-color`. |
| `esports` | Box with icon panels showing last lap and session best, plus a current-lap ticker. Position controlled by `--box-position`. |
| `minimal` | Compact dark card with lap number badge, large elapsed timer, and last lap / session best stats. Position controlled by `--box-position`. |
| `modern` | Slim translucent bar with a subtle diagonal stripe pattern. Shows elapsed time alongside last lap and session best. Position controlled by `--box-position`. |

Segment `mode` still affects the `banner` style layout: `practice` and `qualifying` show last-lap/session-best panels, while `race` shows position and lap count panels.

---

## Development

### Running tests

```bash
pnpm turbo test
```

### Building

```bash
pnpm turbo build
```

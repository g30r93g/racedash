# racedash

Fetch lap times from Alpha Timing, generate YouTube chapter timestamps, and render lap timer overlays onto your race footage.

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

### `racedash drivers <url>`

Lists all drivers in an Alpha Timing session — useful for finding the exact driver name to use in other commands.

```bash
pnpm racedash drivers "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes"
```

---

### `racedash timestamps <url> [driver] --offset <time>`

Prints YouTube chapter timestamps to your terminal. Copy and paste the output into your YouTube video description.

```bash
pnpm racedash timestamps "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" "Surrey A" --offset 2:15
```

**`[driver]` is optional.** If you leave it out, or if multiple drivers match, you'll get an interactive list to pick from.

| Flag | Description | Required |
|------|-------------|----------|
| `--offset <time>` | The video timestamp when the driver crosses the start line for lap 1, e.g. `2:15`, `0:02:15`, or `12345 F` | Yes |
| `--fps <n>` | Video fps used when `--offset` is given as a frame count like `12345 F` | No |

**Example output:**
```
3:23   Lap  1   1:08.588
4:28   Lap  2   1:04.776
5:33   Lap  3   1:05.218
```

#### What is `--offset`?

It's the point in your video where the driver starts lap 1. For example, if your recording begins in the pits and the car crosses the start line 2 minutes 15 seconds in, use `--offset 2:15`.

If you have a frame number instead of a timestamp, you can also use `--offset 12345 F --fps 60`.

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

### `racedash render <url> [driver] --offset <time> --video <path>`

Renders a lap timer overlay onto your video. This takes a few minutes depending on video length.

On Windows, `render` support is experimental. racedash will print a warning at startup, probe your FFmpeg and hardware setup, and fall back to software decoding when the preferred hardware path does not validate.

```bash
pnpm racedash render "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" "Surrey A" \
  --offset 2:15 \
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
| `--offset <time>` | Video timestamp at the start of lap 1, e.g. `1:23.456` or `12345 F` | _(required)_ |
| `--video <path>` | Path to your source video file | _(required)_ |
| `--output <path>` | Where to save the rendered video | `./out.mp4` |
| `--fps <n>` | Output framerate | `60` |
| `--style <name>` | Overlay style (see below) | `banner` |
| `--mode <mode>` | Session type: `practice`, `qualifying`, or `race` | _(required)_ |
| `--overlay-x <n>` | Horizontal position of the overlay in pixels | `0` |
| `--overlay-y <n>` | Vertical position of the overlay in pixels | `0` |
| `--box-position <pos>` | Position for `esports`, `minimal`, and `modern`: `bottom-left`, `bottom-center`, `bottom-right`, `top-left`, `top-center`, `top-right` | `bottom-left` for `esports`/`minimal`, `bottom-center` for `modern` |
| `--accent-color <color>` | Accent colour for the overlay (hex or CSS colour name) | `#3DD73D` |
| `--text-color <color>` | Text colour for the overlay | `white` |
| `--timer-text-color <color>` | Text colour for the centre lap timer specifically | _(falls back to `--text-color`)_ |
| `--timer-bg-color <color>` | Background colour for the centre lap timer | `#111111` |

#### Available styles

| Style | Description |
|-------|-------------|
| `banner` | Full-width top strip with a coloured accent band and a dark centre trap for the lap timer. In `practice`/`qualifying` mode the band also shows last-lap and session-best panels; in `race` mode it shows a position counter and lap fraction at the edges. Flashes purple/green/red on lap completion. Colours are fully configurable via `--accent-color`, `--text-color`, `--timer-text-color`, and `--timer-bg-color`. |
| `esports` | Box with icon panels showing last lap and session best, plus a current-lap ticker. Position controlled by `--box-position`. |
| `minimal` | Compact dark card with lap number badge, large elapsed timer, and last lap / session best stats. Position controlled by `--box-position`. |
| `modern` | Slim translucent bar with a subtle diagonal stripe pattern. Shows elapsed time alongside last lap and session best. Position controlled by `--box-position`. |

**`--mode` affects the `banner` style layout:** in `practice` or `qualifying` mode it renders a full-width banner including last-lap and session-best panels with a `LAST · time · LAP` / `BEST · time · LAP` layout; in `race` mode it shows just the central lap timer with a `POSITION` label and position counter on the left and a `LAP` label with the lap fraction on the right.

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

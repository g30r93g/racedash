# racedash

Fetch lap times from Alpha Timing, generate YouTube chapter timestamps, and render a GT7-style lap timer overlay onto your race footage.

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
| `--offset <time>` | The video timestamp when the driver crosses the start line for lap 1, e.g. `2:15` or `0:02:15` | Yes |

**Example output:**
```
3:23   Lap  1   1:08.588
4:28   Lap  2   1:04.776
5:33   Lap  3   1:05.218
```

#### What is `--offset`?

It's the point in your video where the driver starts lap 1. For example, if your recording begins in the pits and the car crosses the start line 2 minutes 15 seconds in, use `--offset 2:15`.

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

### `racedash render <url> [driver] --offset <time> --video <path>`

Renders a lap timer overlay onto your video. This takes a few minutes depending on video length.

```bash
pnpm racedash render "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes" "Surrey A" \
  --offset 2:15 \
  --video ./race.mp4 \
  --output ./race-out.mp4
```

| Flag | Description | Default |
|------|-------------|---------|
| `--offset <time>` | Video timestamp at the start of lap 1 | _(required)_ |
| `--video <path>` | Path to your source video file | _(required)_ |
| `--output <path>` | Where to save the rendered video | `./out.mp4` |
| `--fps <n>` | Output framerate | `60` |
| `--style <name>` | Overlay style (see below) | `banner` |
| `--mode <mode>` | Session type: `practice`, `qualifying`, or `race` | `race` |
| `--overlay-x <n>` | Horizontal position of the overlay in pixels | `0` |
| `--overlay-y <n>` | Vertical position of the overlay in pixels | `0` |

#### Available styles

| Style | Description | Recommended placement (1080p) |
|-------|-------------|-------------------------------|
| `banner` | Full-width top strip with trapezoid lap timer. Flashes purple/green/red on lap completion based on session best. | `--overlay-x 0 --overlay-y 0` |
| `esports` | Full-width bottom strip with icon panels showing last lap (green) and session best (purple), plus a current-lap ticker. | `--overlay-x 0 --overlay-y 852` |
| `minimal` | Compact dark card with lap number badge, large elapsed timer, and last lap / session best stats. | `--overlay-x 48 --overlay-y 882` |
| `modern` | Slim translucent bar with a subtle banner stripe pattern. Shows elapsed time alongside last lap and session best. | `--overlay-x 0 --overlay-y 984` |

**`--mode` affects the `banner` style layout:** in `practice` or `qualifying` mode it renders a full-width banner including last-lap and session-best panels; in `race` mode it shows just the central lap timer with position and lap counter at the edges.

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

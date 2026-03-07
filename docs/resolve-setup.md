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

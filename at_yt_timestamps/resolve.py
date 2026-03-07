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

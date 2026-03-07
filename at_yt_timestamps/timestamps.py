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

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

"""Utilities for parsing Alpha Timing formatted strings."""


def parse_lap_time_str(s: str) -> float | None:
    """Parse a lap time string 'M:SS.mmm' into total seconds. Returns None if empty or malformed."""
    s = s.strip()
    if not s:
        return None
    try:
        minutes, rest = s.split(":", 1)
        return int(minutes) * 60 + float(rest)
    except (ValueError, AttributeError):
        return None

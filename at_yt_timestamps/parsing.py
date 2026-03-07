def parse_lap_time_str(s: str) -> float | None:
    """Parse a lap time string 'M:SS.mmm' into total seconds. Returns None if empty."""
    s = s.strip()
    if not s:
        return None
    minutes, rest = s.split(":")
    seconds = float(rest)
    return int(minutes) * 60 + seconds

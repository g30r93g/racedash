from dataclasses import dataclass


@dataclass
class Lap:
    number: int
    lap_time_s: float
    cumulative_s: float


@dataclass
class LapTimestamp:
    lap: Lap
    yt_seconds: float

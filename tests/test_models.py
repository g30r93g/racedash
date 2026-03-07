from at_yt_timestamps.models import Lap, LapTimestamp


def test_lap_fields():
    lap = Lap(number=1, lap_time_s=68.588, cumulative_s=68.588)
    assert lap.number == 1
    assert lap.lap_time_s == 68.588
    assert lap.cumulative_s == 68.588


def test_lap_timestamp_fields():
    lap = Lap(number=1, lap_time_s=68.588, cumulative_s=68.588)
    ts = LapTimestamp(lap=lap, yt_seconds=203.588)
    assert ts.lap is lap
    assert ts.yt_seconds == 203.588

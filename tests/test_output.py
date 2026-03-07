from at_yt_timestamps.models import Lap, LapTimestamp
from at_yt_timestamps.output import format_text_output


def test_format_output_two_laps():
    timestamps = [
        LapTimestamp(lap=Lap(number=1, lap_time_s=68.588, cumulative_s=68.588), yt_seconds=203.588),
        LapTimestamp(lap=Lap(number=2, lap_time_s=64.776, cumulative_s=133.364), yt_seconds=268.364),
    ]
    result = format_text_output(timestamps)
    lines = result.strip().split("\n")
    assert len(lines) == 2
    assert lines[0] == "Lap  1   1:08.588   3:23"
    assert lines[1] == "Lap  2   1:04.776   4:28"


def test_format_output_empty():
    assert format_text_output([]) == ""

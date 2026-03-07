import pytest
from at_yt_timestamps.models import Lap, LapTimestamp
from at_yt_timestamps.timestamps import (
    parse_offset,
    calculate_timestamps,
    format_yt_timestamp,
    format_lap_time,
)


# --- parse_offset ---

def test_parse_offset_minutes_seconds():
    assert parse_offset("2:15") == pytest.approx(135.0)


def test_parse_offset_hours_minutes_seconds():
    assert parse_offset("0:02:15") == pytest.approx(135.0)


def test_parse_offset_with_decimal_seconds():
    assert parse_offset("1:23.5") == pytest.approx(83.5)


def test_parse_offset_zero():
    assert parse_offset("0:00") == pytest.approx(0.0)


def test_parse_offset_invalid_raises():
    with pytest.raises(ValueError, match="Invalid offset"):
        parse_offset("not-a-time")


# --- calculate_timestamps ---

def test_calculate_timestamps_applies_offset():
    laps = [
        Lap(number=1, lap_time_s=68.588, cumulative_s=68.588),
        Lap(number=2, lap_time_s=64.776, cumulative_s=133.364),
    ]
    result = calculate_timestamps(laps, offset_seconds=135.0)
    assert result[0].yt_seconds == pytest.approx(68.588 + 135.0)
    assert result[1].yt_seconds == pytest.approx(133.364 + 135.0)


def test_calculate_timestamps_preserves_lap_reference():
    lap = Lap(number=1, lap_time_s=68.588, cumulative_s=68.588)
    result = calculate_timestamps([lap], offset_seconds=0.0)
    assert result[0].lap is lap


# --- format_yt_timestamp ---

def test_format_yt_under_one_hour():
    assert format_yt_timestamp(135.0) == "2:15"


def test_format_yt_over_one_hour():
    assert format_yt_timestamp(3661.0) == "1:01:01"


def test_format_yt_truncates_sub_seconds():
    # YouTube timestamps don't use sub-second precision
    assert format_yt_timestamp(83.9) == "1:23"


# --- format_lap_time ---

def test_format_lap_time():
    assert format_lap_time(68.588) == "1:08.588"


def test_format_lap_time_sub_minute():
    assert format_lap_time(45.1) == "0:45.100"


def test_format_lap_time_rounding():
    assert format_lap_time(60.0) == "1:00.000"

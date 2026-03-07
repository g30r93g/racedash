import pytest
from at_yt_timestamps.parsing import parse_lap_time_str


def test_normal_lap_time():
    assert parse_lap_time_str("1:08.588") == pytest.approx(68.588)


def test_sub_minute_lap_time():
    assert parse_lap_time_str("0:45.100") == pytest.approx(45.1)


def test_exactly_one_minute():
    assert parse_lap_time_str("1:00.000") == pytest.approx(60.0)


def test_empty_string_returns_none():
    assert parse_lap_time_str("") is None


def test_whitespace_returns_none():
    assert parse_lap_time_str("   ") is None

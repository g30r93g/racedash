import pytest
from pathlib import Path
from at_yt_timestamps.alphatiming import parse_drivers, DriverRow
from at_yt_timestamps.models import Lap

FIXTURE = Path(__file__).parent / "fixtures" / "laptimes_sample.html"


@pytest.fixture
def sample_html():
    return FIXTURE.read_text()


def test_parse_drivers_count(sample_html):
    drivers = parse_drivers(sample_html)
    assert len(drivers) == 2


def test_parse_driver_name(sample_html):
    drivers = parse_drivers(sample_html)
    assert drivers[0].name == "Reading C"
    assert drivers[1].name == "Surrey C"


def test_parse_driver_kart_number(sample_html):
    drivers = parse_drivers(sample_html)
    assert drivers[0].kart == "51"


def test_parse_driver_laps(sample_html):
    drivers = parse_drivers(sample_html)
    laps = drivers[0].laps
    assert len(laps) == 3
    assert laps[0] == Lap(number=1, lap_time_s=pytest.approx(68.588), cumulative_s=pytest.approx(68.588))
    assert laps[1] == Lap(number=2, lap_time_s=pytest.approx(64.776), cumulative_s=pytest.approx(133.364))
    assert laps[2] == Lap(number=3, lap_time_s=pytest.approx(65.218), cumulative_s=pytest.approx(198.582))


def test_parse_driver_laps_skips_empty_cells(sample_html):
    drivers = parse_drivers(sample_html)
    # Surrey C has an empty 3rd cell — only 2 laps
    assert len(drivers[1].laps) == 2


def test_parse_cumulative_is_running_sum(sample_html):
    drivers = parse_drivers(sample_html)
    laps = drivers[1].laps
    assert laps[0].cumulative_s == pytest.approx(69.812)
    assert laps[1].cumulative_s == pytest.approx(69.812 + 66.729)

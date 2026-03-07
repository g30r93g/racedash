import pytest
from at_yt_timestamps.alphatiming import DriverRow
from at_yt_timestamps.selection import resolve_driver


def _make_driver(name: str) -> DriverRow:
    return DriverRow(kart="1", name=name, laps=[])


DRIVERS = [
    _make_driver("Reading C"),
    _make_driver("Surrey C"),
    _make_driver("Oxford A"),
]


def test_exact_match_returns_directly():
    result = resolve_driver(DRIVERS, query="Surrey C")
    assert result.name == "Surrey C"


def test_partial_match_unique_returns_directly():
    result = resolve_driver(DRIVERS, query="oxford")
    assert result.name == "Oxford A"


def test_no_query_prompts_from_full_list(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda _: "2")
    result = resolve_driver(DRIVERS, query=None)
    assert result.name == "Surrey C"


def test_ambiguous_query_prompts_from_filtered_list(monkeypatch):
    # "C" matches Reading C and Surrey C
    monkeypatch.setattr("builtins.input", lambda _: "1")
    result = resolve_driver(DRIVERS, query="C")
    # First match in filtered list is Reading C
    assert result.name == "Reading C"


def test_no_match_raises():
    with pytest.raises(ValueError, match="No drivers found matching"):
        resolve_driver(DRIVERS, query="Ferrari")


def test_selection_out_of_range_re_prompts(monkeypatch):
    responses = iter(["99", "1"])
    monkeypatch.setattr("builtins.input", lambda _: next(responses))
    result = resolve_driver(DRIVERS, query=None)
    assert result.name == "Reading C"

from dataclasses import dataclass
from bs4 import BeautifulSoup
import httpx

from at_yt_timestamps.models import Lap
from at_yt_timestamps.parsing import parse_lap_time_str

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)


@dataclass
class DriverRow:
    kart: str
    name: str
    laps: list[Lap]


def fetch_html(url: str) -> str:
    """Fetch the Alpha Timing laptimes page HTML."""
    laptimes_url = _normalise_url(url)
    with httpx.Client() as client:
        response = client.get(laptimes_url, headers={"User-Agent": _USER_AGENT})
        response.raise_for_status()
        return response.text


def parse_drivers(html: str) -> list[DriverRow]:
    """Parse all driver rows from the laptimes HTML."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="at-lap-chart-legend-table")
    if table is None:
        raise ValueError("Could not find laptimes table in the page HTML.")

    rows = table.find("tbody").find_all("tr")
    return [_parse_row(row) for row in rows]


def _parse_row(row) -> DriverRow:
    cells = row.find_all("td")
    competitor = cells[0].find("div", class_="at-lap-chart-legend-table-competitor")
    spans = competitor.find_all("span")
    kart = spans[0].get_text(strip=True)
    name = spans[1].get_text(strip=True)

    laps = []
    cumulative = 0.0
    for i, cell in enumerate(cells[1:], start=1):
        text = cell.find("div").get_text(strip=True)
        lap_time_s = parse_lap_time_str(text)
        if lap_time_s is None:
            continue  # empty cell — driver didn't complete this lap
        cumulative = round(cumulative + lap_time_s, 3)
        laps.append(Lap(number=i, lap_time_s=lap_time_s, cumulative_s=cumulative))

    return DriverRow(kart=kart, name=name, laps=laps)


def _normalise_url(url: str) -> str:
    """Ensure the URL points to the /laptimes tab."""
    tabs = ["/result", "/laptimes", "/lapchart", "/replay", "/grid"]
    for tab in tabs:
        if url.endswith(tab):
            base = url[: -len(tab)]
            return f"{base}/laptimes"
    # No known tab suffix — append /laptimes
    return url.rstrip("/") + "/laptimes"

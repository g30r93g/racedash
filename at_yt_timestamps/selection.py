from at_yt_timestamps.alphatiming import DriverRow


def resolve_driver(drivers: list[DriverRow], query: str | None) -> DriverRow:
    """Return the selected driver, prompting interactively if needed."""
    candidates = _filter(drivers, query)

    if len(candidates) == 1:
        return candidates[0]

    return _prompt(candidates)


def _filter(drivers: list[DriverRow], query: str | None) -> list[DriverRow]:
    if query is None:
        return drivers
    q = query.lower()
    matches = [d for d in drivers if q in d.name.lower()]
    if not matches:
        available = ", ".join(d.name for d in drivers)
        raise ValueError(
            f"No drivers found matching '{query}'. Available: {available}"
        )
    return matches


def _prompt(candidates: list[DriverRow]) -> DriverRow:
    """Print numbered list and ask user to pick one."""
    print("\nDrivers:")
    for i, d in enumerate(candidates, start=1):
        print(f"  {i:2d}. [{d.kart:>3}] {d.name}")

    while True:
        raw = input("\nSelect driver number: ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(candidates):
            return candidates[int(raw) - 1]
        print(f"  Please enter a number between 1 and {len(candidates)}.")

#!/usr/bin/env python3
import argparse
import sys

from at_yt_timestamps.alphatiming import fetch_html, parse_drivers
from at_yt_timestamps.selection import resolve_driver
from at_yt_timestamps.timestamps import parse_offset, calculate_timestamps
from at_yt_timestamps.output import format_text_output


def main():
    parser = argparse.ArgumentParser(
        description="Convert Alpha Timing lap times to YouTube timestamps."
    )
    parser.add_argument("url", help="Alpha Timing session URL (any tab)")
    parser.add_argument(
        "driver",
        nargs="?",
        default=None,
        help="Driver/team name (optional — shows interactive list if omitted)",
    )
    parser.add_argument(
        "--offset",
        required=True,
        metavar="H:MM:SS",
        help="Video timestamp at race start, e.g. 0:02:15",
    )
    parser.add_argument(
        "--resolve",
        action="store_true",
        help="Push markers to the active DaVinci Resolve timeline",
    )
    args = parser.parse_args()

    try:
        offset_s = parse_offset(args.offset)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print("Fetching laptimes...", file=sys.stderr)
    try:
        html = fetch_html(args.url)
    except Exception as e:
        print(f"Error fetching page: {e}", file=sys.stderr)
        sys.exit(1)

    drivers = parse_drivers(html)
    if not drivers:
        print("No driver data found on this page.", file=sys.stderr)
        sys.exit(1)

    try:
        driver = resolve_driver(drivers, args.driver)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\nDriver: [{driver.kart}] {driver.name} — {len(driver.laps)} laps\n", file=sys.stderr)

    timestamps = calculate_timestamps(driver.laps, offset_s)
    print(format_text_output(timestamps))

    if args.resolve:
        try:
            from at_yt_timestamps.resolve import push_markers
            push_markers(timestamps)
        except ImportError:
            print(
                "\nWarning: DaVinci Resolve scripting API not available. "
                "See docs/resolve-setup.md for setup.",
                file=sys.stderr,
            )
        except RuntimeError as e:
            print(f"\nError: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()

# Config-Driven Timing Sources v1

## Summary

Replace the current Alpha-centric inline flows with an explicit config-driven source model for `render`, `timestamps`, and `drivers`. Every segment must declare its `source`, with v1 sources fixed to `alphaTiming`, `teamsportEmail`, `daytona`, and `manual`. Older configs without `source` are intentionally invalid and must be updated.

## Key Changes

### CLI and config behavior

- Make `render`, `timestamps`, and `drivers` read from `--config <path>`.
- Remove inline timing-source inputs from `render` and `timestamps`; they load segments only from config.
- Expand `drivers` to be config-driven:
  - allow segment-only configs with no top-level `driver`
  - accept optional `--driver <name>` to highlight a candidate
  - if `config.driver` or `--driver` is supplied, highlight matching drivers and clearly report when no match is found
  - for multi-segment configs, print one shared driver list if all normalized driver lists are identical; otherwise print per-segment lists
- Require `segments[].source` explicitly. No inference and no default.
- Source-specific segment inputs:
  - `alphaTiming`: requires `url`
  - `teamsportEmail`: requires `emailPath` to a saved `.eml`
  - `daytona`: requires a Speedhive session URL such as `https://speedhive.mylaps.com/sessions/11791523`
  - `manual`: requires `timingData`
- Restrict `timingData` to `manual` only. Reject it on all other sources.

### Source resolution architecture

- Introduce a shared source resolver used by `render`, `timestamps`, and `drivers`.
- Each source resolves to one normalized segment shape containing:
  - selected driver identity when applicable
  - selected driver laps
  - optional full driver list
  - optional all-driver lap lists
  - optional leaderboard/classification data
  - optional race extras such as grid or lap snapshots
- Extract the current Alpha Timing logic into an `alphaTiming` adapter with parity.
- Add `.eml` ingestion for email-backed sources:
  - read the saved email file
  - select the best parseable body part
  - hand normalized text/HTML content to the source parser
- Implement `teamsportEmail` from `.eml` parsing:
  - parse driver names and lap matrix
  - reconstruct per-driver lap lists
  - treat blank cells as missing laps
  - ignore formatting-only markers such as fastest-lap colours
- Implement `daytona` from Speedhive URLs:
  - validate/extract the numeric session ID from the supplied URL
  - perform the required API requests using that session ID
  - keep URL/session resolution separate from Daytona normalization
- Implement `manual` by converting `timingData` directly into normalized laps and cumulative timing.

### Validation and capability reporting

- Reject configs that omit `source` or omit required source-specific fields.
- Reject incompatible field combinations such as:
  - `timingData` on non-`manual`
  - `emailPath` on non-email sources
  - `url` on `manual`
- Validate `manual.timingData` as:
  - array of `{ lap: number, time: string }`
  - positive-sequence integers starting at either `0` or `1`
  - strictly increasing order
  - no gaps after the starting lap
  - parseable lap times
  - if lap `0` is present, it represents the formation/pre-start lap before crossing the line
- Add explicit source capability reporting as a checklist per segment, so users can see what a source supports and what is unavailable.
- The capability checklist should cover at least:
  - driver discovery
  - lap times
  - best lap
  - last lap
  - position
  - position in classification
  - leaderboard
  - gap to leader
  - gap to kart ahead
  - gap to kart behind
  - starting grid
  - race snapshots / replay-derived positions
- `render`, `timestamps`, and `drivers` should surface this checklist whenever a source lacks features racedash knows how to use.
- Rendering and timestamp generation must degrade cleanly when optional features are unavailable rather than failing.

## Test Plan

- Add config validation tests for:
  - explicit `source` required
  - required field enforcement per source
  - invalid field combinations
  - `manual.timingData` sequences starting at `0` and `1`
  - rejection of non-sequential or gap-filled lap numbers
- Add adapter tests for:
  - Alpha Timing parity against current fixtures
  - TeamSport `.eml` parsing from the provided sample
  - Daytona session ID extraction from Speedhive URLs
  - Daytona normalization from recorded API fixtures
  - manual segment conversion including lap `0`
- Add command tests for:
  - `render --config` on mixed-source configs
  - `timestamps --config` on mixed-source configs
  - `drivers --config` with identical vs non-identical segment driver lists
  - `drivers --config --driver ...` highlighting and no-match reporting
  - failure of outdated configs missing `source`
- Acceptance criteria:
  - one shared pipeline resolves segments for all three commands
  - TeamSport works from a saved `.eml`
  - Daytona works from a Speedhive session URL
  - manual works with lap `0` or lap `1`
  - users can see, per segment, which racedash features are supported vs unavailable

## Assumptions and defaults

- v1 sources are exactly `alphaTiming | teamsportEmail | daytona | manual`.
- Older configs must be updated manually; no migration layer is added.
- Email-backed sources use saved `.eml` files only; no mailbox integration and no raw pasted email input.
- `drivers` may run on configs without a top-level `driver`; `render` and `timestamps` still require one.
- A shared multi-segment driver list is considered identical only when the normalized discovered drivers match exactly across segments; otherwise `drivers` prints segment-specific lists.

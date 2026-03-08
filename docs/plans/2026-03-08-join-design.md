# racedash join — Design

## Goal

Add a `join` subcommand to the racedash CLI that concatenates multiple video files (e.g. GoPro chapters) into a single output file using FFmpeg's lossless concat demuxer.

## CLI interface

```
racedash join <files...> --output <path>
```

- `<files...>` — two or more input video paths (explicit, in order)
- `--output` — output path, defaults to `./joined.mp4`

## Architecture

**`packages/compositor/src/index.ts`** — add `joinVideos`:

```ts
export async function joinVideos(inputs: string[], outputPath: string): Promise<void>
```

1. Validate `inputs.length >= 2` (throw `Error` if not)
2. Write a temp file to `/tmp/racedash-concat-<random>.txt` in FFmpeg concat format:
   ```
   file '/absolute/path/to/clip1.mp4'
   file '/absolute/path/to/clip2.mp4'
   ```
3. Run: `ffmpeg -f concat -safe 0 -i <tmpfile> -c copy <outputPath>`
4. Delete the temp file (always, success or failure)
5. Throw on non-zero FFmpeg exit, surfacing stderr

**`apps/cli/src/index.ts`** — add `join` subcommand wired to `joinVideos`.

## Testing

Unit test in `packages/compositor` (mock FFmpeg spawn):
- Asserts temp file written with correct `file '...'` lines using absolute paths
- Asserts FFmpeg called with `-f concat -safe 0 -i <tmpfile> -c copy <output>`
- Temp file deleted after success
- Temp file deleted after failure
- Throws when fewer than 2 inputs provided

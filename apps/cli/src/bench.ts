#!/usr/bin/env tsx
/**
 * Performance benchmark harness for the render pipeline.
 * Runs renderBatch directly — no Electron, no UI, no rebuild cycle.
 *
 * Usage:
 *   pnpm --filter @racedash/cli bench -- <project.json> [options]
 *
 * Examples:
 *   # Full pipeline (overlay + composite)
 *   pnpm --filter @racedash/cli bench -- /path/to/project.json -t lap -s 0 -l 5
 *
 *   # Overlay only (skip composite — isolate Remotion performance)
 *   pnpm --filter @racedash/cli bench -- /path/to/project.json -t lap -s 0 -l 5 --overlay-only
 *
 *   # Multiple runs for stable averages
 *   pnpm --filter @racedash/cli bench -- /path/to/project.json -t lap -s 0 -l 5 -r 3
 *
 *   # Segment render
 *   pnpm --filter @racedash/cli bench -- /path/to/project.json -t segment -s 1
 */

import { program } from 'commander'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { renderBatch } from '@racedash/engine'
import type { BatchJobProgressEvent, BatchJobResult } from '@racedash/engine'

interface ProjectJson {
  configPath: string
  videoPaths: string[]
  segments: Array<{ label: string; id: string }>
}

program
  .name('bench')
  .description('Benchmark the render pipeline without Electron')
  .argument('<project>', 'Path to project.json')
  .option('-t, --type <type>', 'Job type: entireProject, segment, lap', 'lap')
  .option('-s, --segment <index>', 'Segment index', '0')
  .option('-l, --lap <number>', 'Lap number', '5')
  .option('--style <style>', 'Overlay style', 'modern')
  .option('-r, --runs <count>', 'Number of runs', '1')
  .option('-o, --output <dir>', 'Output directory')
  .option('--overlay-only', 'Render overlay only, skip composite')
  .action(async (projectPath: string, opts) => {
    const absProjectPath = path.resolve(projectPath)
    if (!fs.existsSync(absProjectPath)) {
      console.error(`Project not found: ${absProjectPath}`)
      process.exit(1)
    }

    const project: ProjectJson = JSON.parse(fs.readFileSync(absProjectPath, 'utf-8'))
    const outputDir = opts.output
      ? path.resolve(opts.output)
      : path.join(os.tmpdir(), `racedash-bench-${Date.now()}`)
    fs.mkdirSync(outputDir, { recursive: true })

    const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')
    const segIndex = parseInt(opts.segment, 10)
    const lapNumber = parseInt(opts.lap, 10)
    const runs = parseInt(opts.runs, 10)
    const jobType = opts.type as 'entireProject' | 'segment' | 'lap'
    const overlayOnly = opts.overlayOnly === true

    const segLabel = project.segments[segIndex]?.label ?? `Segment ${segIndex}`
    const jobLabel = jobType === 'lap'
      ? `${segLabel} Lap ${lapNumber}`
      : jobType === 'segment'
        ? segLabel
        : 'Entire Project'

    const outputFilename = `bench-${jobLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    const job = {
      id: 'bench-job',
      type: jobType,
      segmentIndices: [segIndex],
      lapNumber: jobType === 'lap' ? lapNumber : undefined,
      outputPath,
    }

    console.log()
    console.log('  RaceDash Render Benchmark')
    console.log('  ─────────────────────────')
    console.log(`  Project:  ${path.basename(path.dirname(absProjectPath))}`)
    console.log(`  Job:      ${jobLabel}`)
    console.log(`  Style:    ${opts.style}`)
    console.log(`  Mode:     ${overlayOnly ? 'overlay-only' : 'overlay + composite'}`)
    console.log(`  Runs:     ${runs}`)
    console.log(`  CPU:      ${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} cores)`)
    console.log(`  Memory:   ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`)
    console.log(`  Output:   ${outputDir}`)
    console.log()

    const results: Array<{ total: number; phases: Record<string, number> }> = []

    for (let run = 0; run < runs; run++) {
      if (runs > 1) console.log(`  Run ${run + 1}/${runs}`)

      const phases: Record<string, number> = {}
      let currentPhase = ''
      let phaseStart = 0
      let lastProgressLine = ''

      const controller = new AbortController()
      const totalStart = performance.now()

      try {
        await renderBatch(
          {
            configPath: project.configPath,
            videoPaths: project.videoPaths,
            rendererEntry,
            style: opts.style,
            renderMode: overlayOnly ? 'overlay-only' : undefined,
            jobs: [job],
          },
          (event: BatchJobProgressEvent) => {
            const phase = event.phase
            if (phase !== currentPhase) {
              if (currentPhase) {
                phases[currentPhase] = (phases[currentPhase] ?? 0) + (performance.now() - phaseStart)
                // Clear progress line and print final
                if (lastProgressLine) {
                  process.stderr.write(`\r  ${currentPhase.padEnd(22)} done\n`)
                  lastProgressLine = ''
                }
              }
              currentPhase = phase
              phaseStart = performance.now()
            }
            const pct = Math.round(event.progress * 100)
            const line = `\r  ${phase.padEnd(22)} ${String(pct).padStart(3)}%`
            if (line !== lastProgressLine) {
              process.stderr.write(line)
              lastProgressLine = line
            }
          },
          (_result: BatchJobResult) => {
            if (currentPhase) {
              phases[currentPhase] = (phases[currentPhase] ?? 0) + (performance.now() - phaseStart)
              if (lastProgressLine) {
                process.stderr.write(`\r  ${currentPhase.padEnd(22)} done\n`)
              }
            }
          },
          (_jobId: string, error: Error) => {
            process.stderr.write('\n')
            console.error(`  ERROR: ${error.message}`)
          },
          controller.signal,
        )
      } catch (err) {
        process.stderr.write('\n')
        console.error(`  FATAL: ${(err as Error).message}`)
        process.exit(1)
      }

      const totalMs = performance.now() - totalStart

      // Print results
      console.log()
      const sortedPhases = Object.entries(phases).sort((a, b) => b[1] - a[1])
      for (const [phase, ms] of sortedPhases) {
        const pct = ((ms / totalMs) * 100).toFixed(0)
        const secs = (ms / 1000).toFixed(1)
        const bar = '█'.repeat(Math.max(1, Math.round((ms / totalMs) * 30)))
        console.log(`  ${phase.padEnd(22)} ${secs.padStart(6)}s  ${pct.padStart(3)}%  ${bar}`)
      }
      console.log(`  ${'─'.repeat(22)} ${'─'.repeat(8)}`)
      console.log(`  ${'TOTAL'.padEnd(22)} ${(totalMs / 1000).toFixed(1).padStart(6)}s`)
      console.log()

      results.push({ total: totalMs, phases })

      // Clean up between runs
      if (run < runs - 1 && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath)
      }
    }

    // Summary for multiple runs
    if (runs > 1) {
      console.log('  Summary')
      console.log('  ───────')
      const totals = results.map(r => r.total / 1000)
      const avg = totals.reduce((a, b) => a + b, 0) / totals.length
      const min = Math.min(...totals)
      const max = Math.max(...totals)
      console.log(`  Total:  avg ${avg.toFixed(1)}s  min ${min.toFixed(1)}s  max ${max.toFixed(1)}s  spread ${(max - min).toFixed(1)}s`)

      const allPhases = [...new Set(results.flatMap(r => Object.keys(r.phases)))]
      for (const phase of allPhases) {
        const values = results.map(r => (r.phases[phase] ?? 0) / 1000)
        const phaseAvg = values.reduce((a, b) => a + b, 0) / values.length
        const phaseMin = Math.min(...values)
        const phaseMax = Math.max(...values)
        console.log(`  ${phase.padEnd(22)} avg ${phaseAvg.toFixed(1).padStart(5)}s  min ${phaseMin.toFixed(1)}s  max ${phaseMax.toFixed(1)}s`)
      }
      console.log()
    }

    if (fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath)
      console.log(`  Output: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
    }
  })

program.parse()

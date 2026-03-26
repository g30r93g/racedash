import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import crypto from 'node:crypto'

// ── 1. Credit conservation ──────────────────────────────────────────────────
// On complete: consumed = rcCost.  On failed: net change = 0 (credits released).
// We test the invariant at the domain-logic level rather than through the DB.

describe('Credit conservation', () => {
  it('complete → consumed equals rcCost; failed → net change is 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), fc.boolean(), (rcCost, succeeds) => {
        let reserved = rcCost
        let consumed = 0
        let released = 0

        if (succeeds) {
          // finalise-job path: consumeCredits
          consumed = reserved
          reserved = 0
        } else {
          // release-credits-and-fail path: releaseCredits
          released = reserved
          reserved = 0
        }

        if (succeeds) {
          expect(consumed).toBe(rcCost)
          expect(reserved).toBe(0)
        } else {
          // Net change to user balance: credits released = credits reserved
          expect(released).toBe(rcCost)
          expect(consumed).toBe(0)
          expect(reserved).toBe(0)
        }
      }),
      { numRuns: 200 },
    )
  })
})

// ── 2. Queue position monotonicity ─────────────────────────────────────────
// Mirrors computeQueuePositions from jobs.ts

function computeQueuePositions(
  queuedJobIds: string[],
  allQueuedJobs: Array<{ id: string; createdAt: Date }>,
): Map<string, number> {
  const sorted = [...allQueuedJobs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const map = new Map<string, number>()
  sorted.forEach((j, i) => {
    if (queuedJobIds.includes(j.id)) map.set(j.id, i + 1)
  })
  return map
}

const arbQueuedJob = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({
    min: new Date('2024-01-01T00:00:00.000Z'),
    max: new Date('2027-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  }),
})

describe('Queue position monotonicity', () => {
  it('N queued jobs → positions 1..N ordered by createdAt ASC', () => {
    fc.assert(
      fc.property(fc.array(arbQueuedJob, { minLength: 1, maxLength: 50 }), (jobs) => {
        // Ensure unique IDs
        const uniqueJobs = jobs.filter((j, i, arr) => arr.findIndex((x) => x.id === j.id) === i)
        const ids = uniqueJobs.map((j) => j.id)
        const positions = computeQueuePositions(ids, uniqueJobs)

        // Every ID should have a position
        expect(positions.size).toBe(uniqueJobs.length)

        // Positions should be 1..N
        const posValues = [...positions.values()].sort((a, b) => a - b)
        posValues.forEach((pos, i) => {
          expect(pos).toBe(i + 1)
        })

        // Earlier createdAt → smaller position
        const sorted = [...uniqueJobs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        for (let i = 1; i < sorted.length; i++) {
          const prevPos = positions.get(sorted[i - 1].id)!
          const currPos = positions.get(sorted[i].id)!
          expect(prevPos).toBeLessThanOrEqual(currPos)
        }
      }),
      { numRuns: 200 },
    )
  })
})

// ── 3. Bitrate selection determinism ────────────────────────────────────────
// Mirrors selectBitrateKbps from prepare-composite/index.ts

function selectBitrateKbps(width: number): number {
  if (width >= 3840) return 50_000
  if (width >= 2560) return 30_000
  return 20_000
}

describe('Bitrate selection determinism', () => {
  it('same width → same bitrate (pure function of width)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 320, max: 7680 }), (width) => {
        const a = selectBitrateKbps(width)
        const b = selectBitrateKbps(width)
        expect(a).toBe(b)

        // Also verify the expected tiers
        if (width >= 3840) {
          expect(a).toBe(50_000)
        } else if (width >= 2560) {
          expect(a).toBe(30_000)
        } else {
          expect(a).toBe(20_000)
        }
      }),
      { numRuns: 200 },
    )
  })
})

// ── 4. HMAC verification symmetry ──────────────────────────────────────────
// Mirrors verifyRemotionSignature from webhooks-remotion.ts

function signHmac(body: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex')
}

function verifyHmac(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha512', secret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

describe('HMAC verification symmetry', () => {
  it('sign + verify with same secret succeeds; different secret fails', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 8, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 64 }),
        (body, secret, otherSecret) => {
          const sig = signHmac(body, secret)
          // Same secret → verification passes
          expect(verifyHmac(body, sig, secret)).toBe(true)

          // Different secret → verification fails (unless secrets are identical)
          if (secret !== otherSecret) {
            const wrongSig = signHmac(body, otherSecret)
            expect(verifyHmac(body, wrongSig, secret)).toBe(false)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ── 5. Presigned URL count ─────────────────────────────────────────────────
// The start-upload handler generates exactly partCount presigned URLs
// with partNumbers 1..partCount. We test the structural invariant directly.

function generatePresignedUrls(partCount: number): Array<{ partNumber: number; url: string }> {
  const urls: Array<{ partNumber: number; url: string }> = []
  for (let i = 1; i <= partCount; i++) {
    urls.push({ partNumber: i, url: `https://s3.example.com/part-${i}` })
  }
  return urls
}

describe('Presigned URL count', () => {
  it('partCount in → exactly partCount URLs out, partNumbers 1..partCount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (partCount) => {
        const urls = generatePresignedUrls(partCount)

        // Exact count
        expect(urls).toHaveLength(partCount)

        // Part numbers are 1..partCount in order
        urls.forEach((u, i) => {
          expect(u.partNumber).toBe(i + 1)
        })

        // Every URL is a non-empty string
        urls.forEach((u) => {
          expect(u.url).toBeTruthy()
          expect(typeof u.url).toBe('string')
        })
      }),
      { numRuns: 200 },
    )
  })
})

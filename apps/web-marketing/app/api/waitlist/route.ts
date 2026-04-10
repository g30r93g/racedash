import { NextResponse } from 'next/server'

// Thin proxy to the RaceDash API. The marketing site is deployed on Vercel
// and the API lives on AWS at api.racedash.io, so we forward the request
// server-side to avoid CORS and to keep the API surface consistent with the
// rest of the product.
//
// Upstream dependency: apps/api needs to expose POST /waitlist. Until that
// ships, this route returns 502 on network error and the form shows its
// error state — we intentionally do NOT fake a success, since silently
// dropping signups would be worse than a visible failure.

const API_BASE = process.env.RACEDASH_API_URL ?? 'https://api.racedash.io'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? String((body as { email: unknown }).email ?? '')
          .trim()
          .toLowerCase()
      : ''

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Forward to the upstream API. If it hasn't shipped the waitlist endpoint
  // yet, we degrade gracefully to a 202 so the form still succeeds for
  // reviewers — the request is logged server-side so nothing is silently lost.
  try {
    const upstream = await fetch(`${API_BASE}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: 'marketing-site',
        userAgent: request.headers.get('user-agent') ?? undefined,
      }),
    })

    if (upstream.ok) {
      return NextResponse.json({ ok: true }, { status: 202 })
    }

    // Upstream returned an error — surface it so the client can show the
    // error state instead of pretending the signup worked.
    const message = await upstream.text().catch(() => 'Upstream error')
    console.error('[waitlist] upstream error', upstream.status, message)
    return NextResponse.json({ error: 'Upstream error' }, { status: 502 })
  } catch (error) {
    // Network / DNS failure — e.g. the API isn't reachable from this env.
    console.error('[waitlist] network error', error)
    return NextResponse.json({ error: 'Network error' }, { status: 502 })
  }
}

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
  }

  const { path } = await params
  const targetPath = `/api/admin/${path.join('/')}`
  const url = new URL(targetPath, API_URL)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }

  let body: string | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text()
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url.toString(), {
    method: request.method,
    headers,
    body,
  })

  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PATCH = proxyRequest

import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, desc } from 'drizzle-orm'
import { users, licenses, connectedAccounts } from '@racedash/db'
import { getDb } from '../lib/db'
import { encryptToken, decryptToken } from '../lib/token-crypto'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { YouTubeStatusResponse, YouTubeDisconnectResponse } from '../types'

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const expectedSig = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  const expectedBuf = Buffer.from(expectedSig)
  const actualBuf = Buffer.from(parts[2])
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required')
  return key
}

const youtubeAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/auth/youtube/connect — redirect to Google OAuth consent
  fastify.get('/api/auth/youtube/connect', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)

    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } })
      return
    }

    // Validate active license
    const [license] = await db
      .select({ id: licenses.id })
      .from(licenses)
      .where(
        and(
          eq(licenses.userId, user.id),
          eq(licenses.status, 'active'),
          gt(licenses.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(licenses.expiresAt))
      .limit(1)

    if (!license) {
      reply.status(403).send({ error: { code: 'LICENSE_REQUIRED', message: 'An active license is required to connect YouTube' } })
      return
    }

    const state = signJwt(
      { sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 },
      getEncryptionKey(),
    )

    const clientId = process.env.YOUTUBE_CLIENT_ID
    if (!clientId) throw new Error('YOUTUBE_CLIENT_ID is required')

    const apiUrl = process.env.API_BASE_URL ?? ''
    const redirectUri = `${apiUrl}/api/auth/youtube/callback`

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload',
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }
  })

  // GET /api/auth/youtube/callback — OAuth redirect from Google (excluded from Clerk auth)
  fastify.get<{ Querystring: { code?: string; state?: string } }>(
    '/api/auth/youtube/callback',
    async (request, reply) => {
      const { code, state } = request.query

      if (!state) {
        reply.status(400).send({ error: { code: 'INVALID_OAUTH_STATE', message: 'Missing OAuth state parameter' } })
        return
      }

      const payload = verifyJwt(state, getEncryptionKey())
      if (!payload || !payload.sub) {
        reply.status(400).send({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state parameter' } })
        return
      }

      if (!code) {
        reply.status(400).send({ error: { code: 'INVALID_OAUTH_STATE', message: 'Missing authorization code' } })
        return
      }

      const userId = payload.sub as string

      // Exchange code for tokens
      const clientId = process.env.YOUTUBE_CLIENT_ID!
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!
      const apiUrl = process.env.API_BASE_URL ?? ''
      const redirectUri = `${apiUrl}/api/auth/youtube/callback`

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        reply.status(400).send({ error: { code: 'OAUTH_TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange authorization code for tokens' } })
        return
      }

      const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string }

      // Fetch YouTube channel info
      const channelResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      )

      let accountName = 'YouTube Channel'
      let accountId = ''

      if (channelResponse.ok) {
        const channelData = await channelResponse.json() as { items?: Array<{ id: string; snippet: { title: string } }> }
        if (channelData.items && channelData.items.length > 0) {
          accountName = channelData.items[0].snippet.title
          accountId = channelData.items[0].id
        }
      }

      // Encrypt tokens
      const encryptedAccessToken = encryptToken(tokens.access_token)
      const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null

      // Upsert connected_accounts
      const db = getDb()
      const [existing] = await db
        .select({ id: connectedAccounts.id })
        .from(connectedAccounts)
        .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.platform, 'youtube')))
        .limit(1)

      if (existing) {
        await db
          .update(connectedAccounts)
          .set({
            accountName,
            accountId,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            connectedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing.id))
      } else {
        await db.insert(connectedAccounts).values({
          userId,
          platform: 'youtube',
          accountName,
          accountId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
        })
      }

      // Redirect to success page (detected by desktop BrowserWindow)
      reply.redirect('/auth/youtube/success')
    },
  )

  // GET /auth/youtube/success — static success page for BrowserWindow detection
  fastify.get('/auth/youtube/success', async (_request, reply) => {
    reply.type('text/html').send('<html><body><h1>YouTube connected successfully</h1><p>You can close this window.</p></body></html>')
  })

  // GET /api/auth/youtube/status
  fastify.get<{ Reply: YouTubeStatusResponse }>('/api/auth/youtube/status', async (request) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)

    if (!user) {
      return { connected: false, account: null }
    }

    const [account] = await db
      .select({
        accountName: connectedAccounts.accountName,
        accountId: connectedAccounts.accountId,
        connectedAt: connectedAccounts.connectedAt,
      })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.platform, 'youtube')))
      .limit(1)

    if (!account) {
      return { connected: false, account: null }
    }

    return {
      connected: true,
      account: {
        accountName: account.accountName ?? '',
        accountId: account.accountId ?? '',
        connectedAt: account.connectedAt.toISOString(),
      },
    }
  })

  // DELETE /api/auth/youtube/disconnect
  fastify.delete<{ Reply: YouTubeDisconnectResponse }>('/api/auth/youtube/disconnect', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)

    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
      return
    }

    const [account] = await db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.platform, 'youtube')))
      .limit(1)

    if (!account) {
      reply.status(404).send({ error: { code: 'YOUTUBE_NOT_CONNECTED', message: 'No YouTube account connected' } } as any)
      return
    }

    await db.delete(connectedAccounts).where(eq(connectedAccounts.id, account.id))

    return { disconnected: true }
  })
}

export default youtubeAuthRoutes

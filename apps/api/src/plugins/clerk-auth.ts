import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { verifyToken } from '@clerk/backend'
import type { ClerkAuthContext } from '../types'

declare module 'fastify' {
  interface FastifyRequest {
    clerk: ClerkAuthContext
  }
}

const EXCLUDED_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/webhooks/clerk' },
  { method: 'POST', path: '/api/webhooks/stripe' },
  { method: 'POST', path: '/api/webhooks/remotion' },
  { method: 'POST', path: '/api/webhooks/render' },
  { method: 'GET', path: '/api/auth/youtube/callback' },
]

function isExcluded(method: string, url: string): boolean {
  return EXCLUDED_ROUTES.some(
    (route) => route.method === method && url.startsWith(route.path),
  )
}

const clerkAuth: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isExcluded(request.method, request.url)) return

    const authHeader = request.headers.authorization

    // Support token via query param for SSE endpoints (EventSource cannot set headers)
    const queryToken = (request.query as Record<string, string>)?.token
    let token: string | undefined

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else if (queryToken) {
      token = queryToken
    }

    if (!token) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      })
      return
    }

    try {
      const secretKey = process.env.CLERK_SECRET_KEY
      if (!secretKey) throw new Error('CLERK_SECRET_KEY is required')

      const payload = await verifyToken(token, { secretKey })

      if (!payload.sub) {
        reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid session token' },
        })
        return
      }

      request.clerk = { userId: payload.sub, sessionId: (payload.sid as string) ?? '' }
    } catch (err) {
      console.error('[clerk-auth] Token verification failed:', err)
      reply.status(401).send({
        error: { code: 'SESSION_EXPIRED', message: 'Session token has expired' },
      })
    }
  })
}

export default fp(clerkAuth, { name: 'clerk-auth' })

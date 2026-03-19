import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { getClerkClient } from '../lib/clerk'
import type { ClerkAuthContext } from '../types'

declare module 'fastify' {
  interface FastifyRequest {
    clerk: ClerkAuthContext
  }
}

const EXCLUDED_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/webhooks/clerk' },
  // cloud-licensing adds: { method: 'POST', path: '/api/webhooks/stripe' }
  // cloud-rendering adds: { method: 'POST', path: '/api/webhooks/remotion' }
  // cloud-rendering adds: { method: 'POST', path: '/api/webhooks/render' }
  // cloud-youtube adds: { method: 'GET', path: '/api/auth/youtube/callback' }
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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      })
      return
    }

    const token = authHeader.slice(7)

    try {
      const clerk = getClerkClient()
      const { sub: userId, sid: sessionId } = await clerk.verifyToken(token)

      if (!userId) {
        reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid session token' },
        })
        return
      }

      request.clerk = { userId, sessionId: sessionId ?? '' }
    } catch {
      reply.status(401).send({
        error: { code: 'SESSION_EXPIRED', message: 'Session token has expired' },
      })
    }
  })
}

export default fp(clerkAuth, { name: 'clerk-auth' })

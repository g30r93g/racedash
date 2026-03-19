import Fastify, { FastifyInstance } from 'fastify'
import type { ClerkAuthContext } from '../../src/types'

declare module 'fastify' {
  interface FastifyRequest {
    clerk: ClerkAuthContext
  }
}

/**
 * Creates a test Fastify instance with mock Clerk auth and raw body parsing.
 * Registers the provided route plugin and returns a ready-to-use app.
 *
 * No real DB or Stripe connections are established — callers must mock
 * those dependencies per test.
 */
export async function createTestApp(
  routes: Parameters<FastifyInstance['register']>[0],
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Raw body parser (mirrors app.ts for webhook signature verification)
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        const parsed = JSON.parse(body as string)
        ;(req as any).rawBody = body
        done(null, parsed)
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // Mock Clerk auth — every request is treated as authenticated
  app.decorateRequest('clerk', null)
  app.addHook('preHandler', async (request) => {
    request.clerk = {
      userId: 'clerk_test_user',
      sessionId: 'sess_test',
    } as ClerkAuthContext
  })

  await app.register(routes)
  await app.ready()
  return app
}

/**
 * Creates a test Fastify instance WITHOUT mock Clerk auth.
 * Use this for testing webhook routes that are excluded from authentication.
 */
export async function createUnauthenticatedTestApp(
  routes: Parameters<FastifyInstance['register']>[0],
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Raw body parser (mirrors app.ts for webhook signature verification)
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        const parsed = JSON.parse(body as string)
        ;(req as any).rawBody = body
        done(null, parsed)
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  await app.register(routes)
  await app.ready()
  return app
}

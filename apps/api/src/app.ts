import Fastify, { FastifyInstance } from 'fastify'
import errorHandler from './plugins/error-handler'
import clerkAuth from './plugins/clerk-auth'
import healthRoutes from './routes/health'
import authRoutes from './routes/auth'
import webhookRoutes from './routes/webhooks'

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  })

  // Register raw body parsing for webhook signature verification
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

  // Plugins
  await app.register(errorHandler)
  await app.register(clerkAuth)

  // Routes
  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(webhookRoutes)

  return app
}

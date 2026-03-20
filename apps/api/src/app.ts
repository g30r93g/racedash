import Fastify, { FastifyInstance } from 'fastify'
import errorHandler from './plugins/error-handler'
import clerkAuth from './plugins/clerk-auth'
import healthRoutes from './routes/health'
import authRoutes from './routes/auth'
import webhookRoutes from './routes/webhooks'
import stripeRoutes from './routes/stripe'
import stripeCreditRoutes from './routes/stripe-credits'
import creditRoutes from './routes/credits'
import licenseRoutes from './routes/license'
import webhooksStripeRoutes from './routes/webhooks-stripe'
import adminRoutes from './routes/admin'
import jobRoutes from './routes/jobs'
import webhooksRemotionRoutes from './routes/webhooks-remotion'
import webhooksRenderRoutes from './routes/webhooks-render'

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
  await app.register(stripeRoutes)
  await app.register(stripeCreditRoutes)
  await app.register(creditRoutes)
  await app.register(licenseRoutes)
  await app.register(webhooksStripeRoutes)
  await app.register(adminRoutes)
  await app.register(jobRoutes)
  await app.register(webhooksRemotionRoutes)
  await app.register(webhooksRenderRoutes)

  return app
}

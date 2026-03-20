import { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import adminAuth from '../../plugins/admin-auth'
import statsRoutes from './stats'
import usersRoutes from './users'
import licensesRoutes from './licenses'
import jobsRoutes from './jobs'
import creditsRoutes from './credits'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(adminAuth)
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.clerk?.userId ?? request.ip,
  })
  await fastify.register(statsRoutes)
  await fastify.register(usersRoutes)
  await fastify.register(licensesRoutes)
  await fastify.register(jobsRoutes)
  await fastify.register(creditsRoutes)
}

export default adminRoutes

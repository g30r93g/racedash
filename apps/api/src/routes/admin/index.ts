import { FastifyPluginAsync } from 'fastify'
import adminAuth from '../../plugins/admin-auth'
import statsRoutes from './stats'
import usersRoutes from './users'
import licensesRoutes from './licenses'
import jobsRoutes from './jobs'
import creditsRoutes from './credits'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(adminAuth)
  await fastify.register(statsRoutes)
  await fastify.register(usersRoutes)
  await fastify.register(licensesRoutes)
  await fastify.register(jobsRoutes)
  await fastify.register(creditsRoutes)
}

export default adminRoutes

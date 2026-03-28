import { FastifyPluginAsync } from 'fastify'
import type { HealthResponse } from '../types'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/api/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-cache')
    return { status: 'ok' }
  })
}

export default healthRoutes

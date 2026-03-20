import { FastifyPluginAsync } from 'fastify'
import { getClerkClient } from '../lib/clerk'

const adminAuth: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    const clerkUserId = request.clerk?.userId
    if (!clerkUserId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      })
    }

    try {
      const clerkClient = getClerkClient()
      const user = await clerkClient.users.getUser(clerkUserId)
      if (user.publicMetadata.role !== 'admin') {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Admin access required' },
        })
      }
    } catch {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      })
    }
  })
}

export default adminAuth

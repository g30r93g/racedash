import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { getClerkClient } from '../lib/clerk'

const adminAuth: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    const clerkUserId = request.clerk.userId

    const clerkClient = getClerkClient()
    const user = await clerkClient.users.getUser(clerkUserId)
    if (user.publicMetadata.role !== 'admin') {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      })
    }
  })
}

export default fp(adminAuth, { name: 'admin-auth' })

import { FastifyPluginAsync, FastifyError } from 'fastify'
import fp from 'fastify-plugin'
import type { ApiError } from '../types'

const errorHandler: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500
    const errorCode = statusCode === 500 ? 'INTERNAL_ERROR' : (error.code ?? 'UNKNOWN_ERROR')

    const response: ApiError = {
      error: {
        code: errorCode,
        message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      },
    }

    if (statusCode === 500) {
      fastify.log.error(error)
    }

    reply.status(statusCode).header('Cache-Control', 'no-store').send(response)
  })
}

export default fp(errorHandler, { name: 'error-handler' })

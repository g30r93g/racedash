import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
  interface FastifyContextConfig {
    rawBody?: boolean
  }
}

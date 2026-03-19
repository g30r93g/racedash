import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import healthRoutes from '../../src/routes/health'

describe('GET /api/health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    await app.register(healthRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns { status: "ok" } with 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('does not require Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      // No Authorization header
    })

    expect(response.statusCode).toBe(200)
  })
})

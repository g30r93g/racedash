import awsLambdaFastify from '@fastify/aws-lambda'
import { createApp } from './app'

// Lambda handler — lazily initialized on first invocation
let proxy: ((event: unknown, context: unknown) => Promise<unknown>) | null = null

export const lambdaHandler = async (event: unknown, context: unknown) => {
  if (!proxy) {
    const app = await createApp()
    proxy = awsLambdaFastify(app) as any
  }
  return proxy!(event, context)
}

// Local dev server
if (process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const start = async () => {
    const app = await createApp()
    const port = parseInt(process.env.PORT ?? '3000', 10)
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`API server running on http://localhost:${port}`)
  }
  start().catch(console.error)
}

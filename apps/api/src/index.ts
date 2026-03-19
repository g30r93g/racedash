import awsLambdaFastify from '@fastify/aws-lambda'
import { createApp } from './app'

// Lambda handler
let handler: ReturnType<typeof awsLambdaFastify> | null = null

export const lambdaHandler = async (event: any, context: any) => {
  if (!handler) {
    const app = await createApp()
    handler = awsLambdaFastify(app)
  }
  return handler(event, context)
}

// Local dev server
if (process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const start = async () => {
    const app = await createApp()
    const port = parseInt(process.env.PORT ?? '3001', 10)
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`API server running on http://localhost:${port}`)
  }
  start().catch(console.error)
}

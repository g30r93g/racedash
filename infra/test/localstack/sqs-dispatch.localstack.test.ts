import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs'

const sqs = new SQSClient({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
})

const QUEUE_URL = process.env.SQS_SOCIAL_UPLOAD_QUEUE_URL ||
  'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/racedash-social-upload-local'

describe('SQS Dispatch (LocalStack)', () => {
  test('sending a message makes it visible to a consumer', async () => {
    const messageBody = JSON.stringify({
      jobId: 'test-job-1',
      userId: 'user-1',
      renderKey: 'renders/test-job-1/output.mp4',
    })

    await sqs.send(new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody,
    }))

    const result = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    }))

    expect(result.Messages).toBeDefined()
    expect(result.Messages!.length).toBe(1)
    expect(JSON.parse(result.Messages![0].Body!)).toEqual({
      jobId: 'test-job-1',
      userId: 'user-1',
      renderKey: 'renders/test-job-1/output.mp4',
    })
  })

  test('visibility timeout is 2700 seconds', async () => {
    const attrs = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl: QUEUE_URL,
      AttributeNames: ['VisibilityTimeout'],
    }))

    expect(attrs.Attributes?.VisibilityTimeout).toBe('2700')
  })
})

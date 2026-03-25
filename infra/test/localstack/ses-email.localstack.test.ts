import {
  SESClient,
  SendEmailCommand,
} from '@aws-sdk/client-ses'

const ses = new SESClient({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
})

const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'test@racedash.local'

describe('SES Email (LocalStack)', () => {
  test('SendEmail call succeeds', async () => {
    const result = await ses.send(new SendEmailCommand({
      Source: FROM_ADDRESS,
      Destination: {
        ToAddresses: ['user@example.com'],
      },
      Message: {
        Subject: { Data: 'RaceDash Render Complete' },
        Body: {
          Text: { Data: 'Your render is ready for download.' },
        },
      },
    }))

    expect(result.MessageId).toBeDefined()
  })

  test('sent emails are captured by LocalStack', async () => {
    await ses.send(new SendEmailCommand({
      Source: FROM_ADDRESS,
      Destination: {
        ToAddresses: ['capture-test@example.com'],
      },
      Message: {
        Subject: { Data: 'Capture Test' },
        Body: {
          Text: { Data: 'This email should be captured.' },
        },
      },
    }))

    // LocalStack captures sent emails at /_aws/ses endpoint
    const endpoint = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566'
    const response = await fetch(`${endpoint}/_aws/ses`)
    const data = await response.json() as { messages: unknown[] }

    expect(data.messages).toBeDefined()
    expect(data.messages.length).toBeGreaterThan(0)
  })
})

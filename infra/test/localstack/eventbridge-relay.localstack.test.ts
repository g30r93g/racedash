import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'

const eventBridge = new EventBridgeClient({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
})

const STATE_MACHINE_ARN = process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN ||
  'arn:aws:states:us-east-1:000000000000:stateMachine:RenderPipeline-local'

describe('EventBridge Relay (LocalStack)', () => {
  test('publishing a Step Functions terminal state event succeeds', async () => {
    const result = await eventBridge.send(new PutEventsCommand({
      Entries: [
        {
          Source: 'aws.states',
          DetailType: 'Step Functions Execution Status Change',
          Detail: JSON.stringify({
            stateMachineArn: STATE_MACHINE_ARN,
            status: 'SUCCEEDED',
            executionArn: 'arn:aws:states:us-east-1:000000000000:execution:RenderPipeline-local:test-123',
          }),
        },
      ],
    }))

    expect(result.FailedEntryCount).toBe(0)
    expect(result.Entries).toBeDefined()
    expect(result.Entries!.length).toBe(1)
    expect(result.Entries![0].EventId).toBeDefined()
  })
})

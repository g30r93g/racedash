import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs'

const eventBridge = new EventBridgeClient({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
})

const logs = new CloudWatchLogsClient({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
})

const RELAY_FUNCTION_NAME = process.env.RELAY_FUNCTION_NAME || 'racedash-relay-local'

const STATE_MACHINE_ARN =
  process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN ||
  'arn:aws:states:us-east-1:000000000000:stateMachine:RenderPipeline-local'

describe('EventBridge Relay (LocalStack)', () => {
  test('publishing a Step Functions terminal state event succeeds', async () => {
    const result = await eventBridge.send(
      new PutEventsCommand({
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
      }),
    )

    expect(result.FailedEntryCount).toBe(0)
    expect(result.Entries).toBeDefined()
    expect(result.Entries!.length).toBe(1)
    expect(result.Entries![0].EventId).toBeDefined()
  })

  test('relay Lambda is invoked with the correct event payload', async () => {
    const uniqueExecId = `test-relay-${Date.now()}`
    const eventDetail = {
      stateMachineArn: STATE_MACHINE_ARN,
      status: 'SUCCEEDED',
      executionArn: `arn:aws:states:us-east-1:000000000000:execution:RenderPipeline-local:${uniqueExecId}`,
    }

    const beforeTimestamp = Date.now()

    // Publish the event that should trigger the relay Lambda
    const putResult = await eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'aws.states',
            DetailType: 'Step Functions Execution Status Change',
            Detail: JSON.stringify(eventDetail),
          },
        ],
      }),
    )
    expect(putResult.FailedEntryCount).toBe(0)

    // Wait for the Lambda to be invoked and log output to appear
    const logGroupName = `/aws/lambda/${RELAY_FUNCTION_NAME}`
    let found = false

    // Poll CloudWatch Logs for up to 15 seconds
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      try {
        const logEvents = await logs.send(
          new FilterLogEventsCommand({
            logGroupName,
            startTime: beforeTimestamp,
            filterPattern: uniqueExecId,
          }),
        )

        if (logEvents.events && logEvents.events.length > 0) {
          // Verify the Lambda received the expected execution ARN in its payload
          const matchingEvent = logEvents.events.find(
            (e: { message?: string }) => e.message && e.message.includes(uniqueExecId),
          )
          expect(matchingEvent).toBeDefined()
          found = true
          break
        }
      } catch {
        // Log group may not exist yet; keep polling
      }
    }

    expect(found).toBe(true)
  })
})

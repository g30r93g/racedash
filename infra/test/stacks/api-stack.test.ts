import { Template, Match } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('ApiStack', () => {
  let template: Template

  beforeAll(() => {
    const { api } = createTestStacks()
    template = Template.fromStack(api)
  })

  test('API Lambda exists with runtime nodejs20.x, architecture arm64, MemorySize 512, Timeout 30', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      Runtime: 'nodejs20.x',
      Architectures: ['arm64'],
      MemorySize: 512,
      Timeout: 30,
    }))
  })

  test('Lambda Function URL exists with AuthType NONE', () => {
    template.hasResourceProperties('AWS::Lambda::Url', {
      AuthType: 'NONE',
    })
  })

  test('API Lambda role has s3:PutObject, s3:GetObject, s3:DeleteObject on uploads bucket', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              's3:PutObject',
              's3:GetObject',
              's3:DeleteObject',
            ]),
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('API Lambda role has s3:GetObject on renders bucket', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:GetObject',
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('API Lambda role has states:StartExecution on state machine', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'states:StartExecution',
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('API Lambda role has states:SendTaskSuccess, states:SendTaskFailure on state machine', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'states:SendTaskSuccess',
              'states:SendTaskFailure',
            ]),
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('API Lambda role has sqs:SendMessage on social upload queue', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sqs:SendMessage',
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('API Lambda has required environment variables', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          CLERK_SECRET_KEY: Match.anyValue(),
          DATABASE_URL: Match.anyValue(),
          S3_UPLOAD_BUCKET: Match.anyValue(),
          S3_RENDERS_BUCKET: Match.anyValue(),
          CLOUDFRONT_DOMAIN: Match.anyValue(),
          CLOUDFRONT_KEY_PAIR_ID: Match.anyValue(),
          STEP_FUNCTIONS_STATE_MACHINE_ARN: Match.anyValue(),
          STRIPE_SECRET_KEY: Match.anyValue(),
          STRIPE_WEBHOOK_SECRET: Match.anyValue(),
          YOUTUBE_CLIENT_ID: Match.anyValue(),
          YOUTUBE_CLIENT_SECRET: Match.anyValue(),
          SQS_SOCIAL_UPLOAD_QUEUE_URL: Match.anyValue(),
          WEBHOOK_SECRET: Match.anyValue(),
          REMOTION_WEBHOOK_SECRET: Match.anyValue(),
          TOKEN_ENCRYPTION_KEY: Match.anyValue(),
        }),
      }),
    }))
  })

  test('stack exports ApiFunctionArn and ApiFunctionUrl', () => {
    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-ApiFunctionArn'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-ApiFunctionUrl'),
      },
    }))
  })
})

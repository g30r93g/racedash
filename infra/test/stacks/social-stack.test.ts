import { Template, Match } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('SocialStack', () => {
  let template: Template

  beforeAll(() => {
    const { social } = createTestStacks()
    template = Template.fromStack(social)
  })

  test('ECS Fargate cluster exists', () => {
    template.resourceCountIs('AWS::ECS::Cluster', 1)
  })

  test('task definition with Cpu: 512, Memory: 1024', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', Match.objectLike({
      Cpu: '512',
      Memory: '1024',
    }))
  })

  test('SQS queue with VisibilityTimeout 2700 and MessageRetentionPeriod 345600', () => {
    template.hasResourceProperties('AWS::SQS::Queue', Match.objectLike({
      VisibilityTimeout: 2700,
      MessageRetentionPeriod: 345600,
    }))
  })

  test('DLQ exists with maxReceiveCount 3 in redrive policy', () => {
    template.hasResourceProperties('AWS::SQS::Queue', Match.objectLike({
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 3,
      }),
    }))
  })

  test('Dispatch Lambda exists triggered by SQS', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', Match.objectLike({
      FunctionName: Match.anyValue(),
      EventSourceArn: Match.anyValue(),
    }))
  })

  test('Dispatch Lambda has ecs:RunTask permission on task definition', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ecs:RunTask',
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('task role has s3:GetObject on renders bucket and ses:SendEmail', () => {
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

    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ses:SendEmail',
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('stack exports queue URL, queue ARN, cluster ARN, task def ARN', () => {
    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-SocialUploadQueueUrl'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-SocialUploadQueueArn'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-SocialClusterArn'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-YouTubeUploadTaskDefArn'),
      },
    }))
  })
})

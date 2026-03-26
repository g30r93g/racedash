import { Template, Match } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('NotificationsStack', () => {
  let template: Template

  beforeAll(() => {
    const { notifications } = createTestStacks()
    template = Template.fromStack(notifications)
  })

  test('SES email identity exists', () => {
    template.resourceCountIs('AWS::SES::EmailIdentity', 1)
  })

  test('stack exports SesFromAddress and SesIdentityArn', () => {
    template.hasOutput(
      '*',
      Match.objectLike({
        Export: {
          Name: Match.stringLikeRegexp('test-SesFromAddress'),
        },
      }),
    )

    template.hasOutput(
      '*',
      Match.objectLike({
        Export: {
          Name: Match.stringLikeRegexp('test-SesIdentityArn'),
        },
      }),
    )
  })
})

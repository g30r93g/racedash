import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('NotificationsStack Snapshot', () => {
  const stacks = createTestStacks()

  test('NotificationsStack snapshot', () => {
    const template = Template.fromStack(stacks.notifications)
    expect(template.toJSON()).toMatchSnapshot()
  })
})

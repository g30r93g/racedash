import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks, sanitizeTemplate } from '../test-helper'

describe('NotificationsStack Snapshot', () => {
  const stacks = createTestStacks()

  test('NotificationsStack snapshot', () => {
    const template = Template.fromStack(stacks.notifications)
    expect(sanitizeTemplate(template.toJSON())).toMatchSnapshot()
  })
})

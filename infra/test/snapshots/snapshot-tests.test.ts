import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('Snapshot Tests', () => {
  const stacks = createTestStacks()

  test('StorageStack snapshot', () => {
    const template = Template.fromStack(stacks.storage)
    expect(template.toJSON()).toMatchSnapshot()
  })

  test('PipelineStack snapshot', () => {
    const template = Template.fromStack(stacks.pipeline)
    expect(template.toJSON()).toMatchSnapshot()
  })

  test('NotificationsStack snapshot', () => {
    const template = Template.fromStack(stacks.notifications)
    expect(template.toJSON()).toMatchSnapshot()
  })

  test('ApiStack snapshot', () => {
    const template = Template.fromStack(stacks.api)
    expect(template.toJSON()).toMatchSnapshot()
  })

  test('SocialStack snapshot', () => {
    const template = Template.fromStack(stacks.social)
    expect(template.toJSON()).toMatchSnapshot()
  })
})

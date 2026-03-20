import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('SocialStack Snapshot', () => {
  const stacks = createTestStacks()

  test('SocialStack snapshot', () => {
    const template = Template.fromStack(stacks.social)
    expect(template.toJSON()).toMatchSnapshot()
  })
})

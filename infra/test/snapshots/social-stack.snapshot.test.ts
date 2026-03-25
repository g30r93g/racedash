import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks, sanitizeTemplate } from '../test-helper'

describe('SocialStack Snapshot', () => {
  const stacks = createTestStacks()

  test('SocialStack snapshot', () => {
    const template = Template.fromStack(stacks.social)
    expect(sanitizeTemplate(template.toJSON())).toMatchSnapshot()
  })
})

import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks, sanitizeTemplate } from '../test-helper'

describe('ApiStack Snapshot', () => {
  const stacks = createTestStacks()

  test('ApiStack snapshot', () => {
    const template = Template.fromStack(stacks.api)
    expect(sanitizeTemplate(template.toJSON())).toMatchSnapshot()
  })
})

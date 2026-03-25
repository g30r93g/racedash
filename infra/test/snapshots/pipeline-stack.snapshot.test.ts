import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks, sanitizeTemplate } from '../test-helper'

describe('PipelineStack Snapshot', () => {
  const stacks = createTestStacks()

  test('PipelineStack snapshot', () => {
    const template = Template.fromStack(stacks.pipeline)
    expect(sanitizeTemplate(template.toJSON())).toMatchSnapshot()
  })
})

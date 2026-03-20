import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('PipelineStack Snapshot', () => {
  const stacks = createTestStacks()

  test('PipelineStack snapshot', () => {
    const template = Template.fromStack(stacks.pipeline)
    expect(template.toJSON()).toMatchSnapshot()
  })
})

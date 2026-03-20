import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('StorageStack Snapshot', () => {
  const stacks = createTestStacks()

  test('StorageStack snapshot', () => {
    const template = Template.fromStack(stacks.storage)
    expect(template.toJSON()).toMatchSnapshot()
  })
})

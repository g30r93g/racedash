import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks, sanitizeTemplate } from '../test-helper'

describe('StorageStack Snapshot', () => {
  const stacks = createTestStacks()

  test('StorageStack snapshot', () => {
    const template = Template.fromStack(stacks.storage)
    expect(sanitizeTemplate(template.toJSON())).toMatchSnapshot()
  })
})

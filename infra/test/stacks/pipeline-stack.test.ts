import { Template, Match } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

let template: Template

beforeAll(() => {
  const { pipeline } = createTestStacks()
  template = Template.fromStack(pipeline)
})

function getStateMachineDefinitionString(): string {
  const resources = template.findResources('AWS::StepFunctions::StateMachine')
  const sm = Object.values(resources)[0] as any
  const def = sm.Properties.DefinitionString
  // Handle Fn::Join (CDK serializes definitions this way)
  if (typeof def === 'object' && def['Fn::Join']) {
    return def['Fn::Join'][1]
      .map((part: any) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join('')
  }
  return typeof def === 'string' ? def : JSON.stringify(def)
}

describe('PipelineStack', () => {
  test('State machine exists', () => {
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1)
  })

  test('Lambda functions exist with nodejs20.x runtime and arm64 architecture', () => {
    const functions = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Runtime: 'nodejs20.x',
        Architectures: ['arm64'],
      },
    })
    expect(Object.keys(functions).length).toBeGreaterThanOrEqual(9)
  })

  test('State machine definition contains WaitForSlot with HeartbeatSeconds 21600', () => {
    const defStr = getStateMachineDefinitionString()
    expect(defStr).toContain('WaitForSlot')
    expect(defStr).toContain('"HeartbeatSeconds":21600')
  })

  test('StartRenderOverlay has HeartbeatSeconds 900', () => {
    const defStr = getStateMachineDefinitionString()
    expect(defStr).toContain('StartRenderOverlay')
    expect(defStr).toContain('"HeartbeatSeconds":900')
  })

  test('State machine definition contains all required states', () => {
    const defStr = getStateMachineDefinitionString()

    const expectedStates = [
      'WaitForSlot',
      'GrantSlot',
      'StartRenderOverlay',
      'PrepareComposite',
      'RunMediaConvert',
      'FinaliseJob',
      'NotifyUser',
      'LogNotifyError',
      'ReleaseCreditsAndFail',
      'Succeed',
      'Fail',
    ]

    for (const state of expectedStates) {
      expect(defStr).toContain(state)
    }
  })

  test('RunMediaConvert uses arn:aws:states:::mediaconvert:createJob.sync resource', () => {
    const defStr = getStateMachineDefinitionString()
    expect(defStr).toContain('arn:aws:states:::mediaconvert:createJob.sync')
  })

  test('MediaConvert IAM role has trust policy for mediaconvert.amazonaws.com', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: Match.objectLike({
              Service: 'mediaconvert.amazonaws.com',
            }),
          }),
        ]),
      }),
    })
  })

  test('State machine execution role has mediaconvert:CreateJob, iam:PassRole, and lambda:InvokeFunction permissions', () => {
    const policies = template.findResources('AWS::IAM::Policy')
    const policyValues = Object.values(policies) as any[]
    const allStatements = policyValues.flatMap(
      (p) => p.Properties?.PolicyDocument?.Statement ?? [],
    )
    const allActions = allStatements.flatMap((s: any) =>
      Array.isArray(s.Action) ? s.Action : [s.Action],
    )

    expect(allActions).toContain('mediaconvert:CreateJob')
    expect(allActions).toContain('iam:PassRole')
    expect(allActions).toContain('lambda:InvokeFunction')
  })

  test('FinaliseJobFunction has states:SendTaskSuccess and states:SendTaskFailure permissions', () => {
    const policies = template.findResources('AWS::IAM::Policy')
    const policyValues = Object.values(policies) as any[]
    const allStatements = policyValues.flatMap(
      (p) => p.Properties?.PolicyDocument?.Statement ?? [],
    )
    const allActions = allStatements.flatMap((s: any) =>
      Array.isArray(s.Action) ? s.Action : [s.Action],
    )

    expect(allActions).toContain('states:SendTaskSuccess')
    expect(allActions).toContain('states:SendTaskFailure')
  })

  test('ReleaseCreditsAndFailFunction has states:SendTaskSuccess, states:SendTaskFailure, and ses:SendEmail permissions', () => {
    const policies = template.findResources('AWS::IAM::Policy')
    const policyValues = Object.values(policies) as any[]
    const allStatements = policyValues.flatMap(
      (p) => p.Properties?.PolicyDocument?.Statement ?? [],
    )
    const allActions = allStatements.flatMap((s: any) =>
      Array.isArray(s.Action) ? s.Action : [s.Action],
    )

    expect(allActions).toContain('states:SendTaskSuccess')
    expect(allActions).toContain('states:SendTaskFailure')
    expect(allActions).toContain('ses:SendEmail')
  })

  test('Remotion Lambda exists with 1024 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 1024,
    })
  })

  test('Remotion site bucket exists with name containing racedash-remotion-site', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('racedash-remotion-site'),
    })
  })

  test('EventBridge rule exists matching Step Functions terminal states', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        source: Match.arrayWith(['aws.states']),
        'detail-type': Match.arrayWith([
          Match.stringLikeRegexp('Step Functions Execution Status Change'),
        ]),
      }),
    })
  })

  test('Relay Lambda has WEBHOOK_TARGET_URL and WEBHOOK_SECRET environment variables', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          WEBHOOK_TARGET_URL: Match.anyValue(),
          WEBHOOK_SECRET: Match.anyValue(),
        }),
      }),
    })
  })

  test('Stack exports StateMachineArn, RemotionFunctionName, RemotionServeUrl, MediaConvertRoleArn', () => {
    const allOutputText = JSON.stringify(template.findOutputs('*'))
    expect(allOutputText).toContain('StateMachineArn')
    expect(allOutputText).toContain('RemotionFunctionName')
    expect(allOutputText).toContain('RemotionServeUrl')
    expect(allOutputText).toContain('MediaConvertRoleArn')
  })

  test('every non-terminal state has a Catch block', () => {
    const defStr = getStateMachineDefinitionString()
    const definition = JSON.parse(defStr)
    const states: Record<string, any> = definition.States

    const nonTerminalStateNames = [
      'WaitForSlot',
      'GrantSlot',
      'StartRenderOverlay',
      'PrepareComposite',
      'RunMediaConvert',
      'FinaliseJob',
      'NotifyUser',
    ]

    for (const name of nonTerminalStateNames) {
      const state = states[name]
      expect(state).toBeDefined()
      expect(state.Catch).toBeDefined()
      expect(Array.isArray(state.Catch)).toBe(true)
      expect(state.Catch.length).toBeGreaterThan(0)
    }
  })
})

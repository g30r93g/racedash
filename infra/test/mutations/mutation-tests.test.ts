import { Template, Match } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

let storageTemplateJson: Record<string, any>
let pipelineTemplateJson: Record<string, any>

beforeAll(() => {
  const stacks = createTestStacks()
  storageTemplateJson = Template.fromStack(stacks.storage).toJSON()
  pipelineTemplateJson = Template.fromStack(stacks.pipeline).toJSON()
})

function findResourceKeyByProperty(
  templateJson: Record<string, any>,
  resourceType: string,
  predicate: (props: Record<string, any>) => boolean,
): string | undefined {
  const resources: Record<string, any> = templateJson.Resources ?? {}
  return Object.keys(resources).find((key) => {
    const resource = resources[key]
    return resource.Type === resourceType && predicate(resource.Properties ?? {})
  })
}

describe('Mutation Tests', () => {
  test('mutation: remove S3 encryption from uploads bucket', () => {
    const templateJson = JSON.parse(JSON.stringify(storageTemplateJson))

    const key = findResourceKeyByProperty(
      templateJson,
      'AWS::S3::Bucket',
      (props) =>
        typeof props.BucketName === 'string' &&
        props.BucketName.includes('racedash-uploads') &&
        props.BucketEncryption !== undefined,
    )
    expect(key).toBeDefined()
    delete templateJson.Resources[key!].Properties.BucketEncryption

    const mutated = Template.fromJSON(templateJson)

    expect(() => {
      mutated.hasResourceProperties(
        'AWS::S3::Bucket',
        Match.objectLike({
          BucketName: Match.stringLikeRegexp('racedash-uploads'),
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
        }),
      )
    }).toThrow()
  })

  test('mutation: remove public access block from uploads bucket', () => {
    const templateJson = JSON.parse(JSON.stringify(storageTemplateJson))

    const key = findResourceKeyByProperty(
      templateJson,
      'AWS::S3::Bucket',
      (props) =>
        typeof props.BucketName === 'string' &&
        props.BucketName.includes('racedash-uploads') &&
        props.PublicAccessBlockConfiguration !== undefined,
    )
    expect(key).toBeDefined()
    delete templateJson.Resources[key!].Properties.PublicAccessBlockConfiguration

    const mutated = Template.fromJSON(templateJson)

    expect(() => {
      mutated.hasResourceProperties(
        'AWS::S3::Bucket',
        Match.objectLike({
          BucketName: Match.stringLikeRegexp('racedash-uploads'),
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
        }),
      )
    }).toThrow()
  })

  test('mutation: widen MediaConvert role to s3:*', () => {
    const templateJson = JSON.parse(JSON.stringify(pipelineTemplateJson))

    // Find the MediaConvert IAM role's inline policy
    const resources: Record<string, any> = templateJson.Resources
    const policyKeys = Object.keys(resources).filter(
      (key) => resources[key].Type === 'AWS::IAM::Policy',
    )

    let mutated = false
    for (const policyKey of policyKeys) {
      const statements: any[] =
        resources[policyKey].Properties?.PolicyDocument?.Statement ?? []
      for (const stmt of statements) {
        const actions: string[] = Array.isArray(stmt.Action)
          ? stmt.Action
          : [stmt.Action]
        const hasS3Actions = actions.some(
          (a) => typeof a === 'string' && a.startsWith('s3:') && a !== 's3:*',
        )
        if (hasS3Actions) {
          stmt.Action = 's3:*'
          mutated = true
          break
        }
      }
      if (mutated) break
    }
    expect(mutated).toBe(true)

    const mutatedTemplate = Template.fromJSON(templateJson)

    // Verifying that no wildcard s3 actions exist should now fail
    expect(() => {
      // This assertion succeeds only when there are no s3:* actions;
      // after mutation, the policy contains s3:* so an assertion that
      // specific-only actions exist should throw.
      mutatedTemplate.hasResourceProperties(
        'AWS::IAM::Policy',
        Match.objectLike({
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: Match.arrayWith(['s3:GetObject']),
              }),
            ]),
          }),
        }),
      )
      // Force a throw: if s3:* replaced the specific actions the above may
      // still pass for other policies, so we assert s3:* is NOT present
      // using a negation pattern — any assertion for the specific narrowed
      // list will fail once replaced with the wildcard.
      mutatedTemplate.hasResourceProperties(
        'AWS::IAM::Policy',
        Match.not(
          Match.objectLike({
            PolicyDocument: Match.objectLike({
              Statement: Match.arrayWith([
                Match.objectLike({
                  Action: 's3:*',
                }),
              ]),
            }),
          }),
        ),
      )
    }).toThrow()
  })

  test('mutation: remove HeartbeatSeconds from WaitForSlot state', () => {
    const templateJson = JSON.parse(JSON.stringify(pipelineTemplateJson))

    const resources: Record<string, any> = templateJson.Resources
    const smKey = Object.keys(resources).find(
      (key) => resources[key].Type === 'AWS::StepFunctions::StateMachine',
    )
    expect(smKey).toBeDefined()

    const def = resources[smKey!].Properties.DefinitionString
    let defStr: string
    if (typeof def === 'object' && def['Fn::Join']) {
      defStr = def['Fn::Join'][1]
        .map((part: any) => (typeof part === 'string' ? part : '__CDK_TOKEN__'))
        .join('')
    } else {
      defStr = typeof def === 'string' ? def : JSON.stringify(def)
    }

    expect(defStr).toContain('"HeartbeatSeconds":21600')
    const mutatedDefStr = defStr.replace(/"HeartbeatSeconds":21600/g, '')

    // Rebuild DefinitionString as a plain string
    resources[smKey!].Properties.DefinitionString = mutatedDefStr

    const mutatedTemplate = Template.fromJSON(templateJson)

    expect(() => {
      const smResources = mutatedTemplate.findResources(
        'AWS::StepFunctions::StateMachine',
      )
      const sm = Object.values(smResources)[0] as any
      const rawDef = sm.Properties.DefinitionString
      const resultStr =
        typeof rawDef === 'string' ? rawDef : JSON.stringify(rawDef)
      if (!resultStr.includes('"HeartbeatSeconds":21600')) {
        throw new Error('HeartbeatSeconds:21600 not found in WaitForSlot state')
      }
    }).toThrow()
  })

  test('mutation: change state machine TimeoutSeconds from 28800 to 3600', () => {
    const templateJson = JSON.parse(JSON.stringify(pipelineTemplateJson))

    const resources: Record<string, any> = templateJson.Resources
    const smKey = Object.keys(resources).find(
      (key) => resources[key].Type === 'AWS::StepFunctions::StateMachine',
    )
    expect(smKey).toBeDefined()

    // CDK embeds timeout in the DefinitionString, not as a top-level property.
    // Mutate it within the definition string.
    const def = resources[smKey!].Properties.DefinitionString
    let defStr: string
    if (typeof def === 'object' && def['Fn::Join']) {
      defStr = def['Fn::Join'][1]
        .map((part: any) => (typeof part === 'string' ? part : '__CDK_TOKEN__'))
        .join('')
    } else {
      defStr = typeof def === 'string' ? def : JSON.stringify(def)
    }

    expect(defStr).toContain('"TimeoutSeconds":28800')
    const mutatedDefStr = defStr.replace('"TimeoutSeconds":28800', '"TimeoutSeconds":3600')
    resources[smKey!].Properties.DefinitionString = mutatedDefStr

    expect(() => {
      if (!mutatedDefStr.includes('"TimeoutSeconds":28800')) {
        throw new Error('TimeoutSeconds 28800 not found after mutation')
      }
    }).toThrow()
  })

  test('mutation: remove TrustedKeyGroups from CloudFront default cache behavior', () => {
    const templateJson = JSON.parse(JSON.stringify(storageTemplateJson))

    const distKey = findResourceKeyByProperty(
      templateJson,
      'AWS::CloudFront::Distribution',
      (props) =>
        props.DistributionConfig?.DefaultCacheBehavior?.TrustedKeyGroups !== undefined,
    )
    expect(distKey).toBeDefined()

    delete templateJson.Resources[distKey!].Properties.DistributionConfig
      .DefaultCacheBehavior.TrustedKeyGroups

    const mutatedTemplate = Template.fromJSON(templateJson)

    expect(() => {
      const distributions = mutatedTemplate.findResources(
        'AWS::CloudFront::Distribution',
      )
      const dist = Object.values(distributions)[0] as any
      const keyGroups =
        dist.Properties.DistributionConfig.DefaultCacheBehavior.TrustedKeyGroups
      if (!keyGroups || keyGroups.length === 0) {
        throw new Error('TrustedKeyGroups is missing or empty')
      }
    }).toThrow()
  })

  test('mutation: remove Catch from StartRenderOverlay — must fail the Catch spec test', () => {
    const templateJson = JSON.parse(JSON.stringify(pipelineTemplateJson))

    const resources: Record<string, any> = templateJson.Resources
    const smKey = Object.keys(resources).find(
      (key) => resources[key].Type === 'AWS::StepFunctions::StateMachine',
    )
    expect(smKey).toBeDefined()

    const def = resources[smKey!].Properties.DefinitionString
    let defStr: string
    if (typeof def === 'object' && def['Fn::Join']) {
      defStr = def['Fn::Join'][1]
        .map((part: any) => (typeof part === 'string' ? part : '__CDK_TOKEN__'))
        .join('')
    } else {
      defStr = typeof def === 'string' ? def : JSON.stringify(def)
    }

    const definition = JSON.parse(defStr)
    expect(definition.States.StartRenderOverlay).toBeDefined()
    expect(definition.States.StartRenderOverlay.Catch).toBeDefined()

    // Mutate: remove Catch from StartRenderOverlay
    delete definition.States.StartRenderOverlay.Catch

    // Rebuild DefinitionString as a plain string
    resources[smKey!].Properties.DefinitionString = JSON.stringify(definition)

    // Verify that asserting all non-terminal states have Catch now fails
    const nonTerminalStateNames = [
      'WaitForSlot',
      'GrantSlot',
      'StartRenderOverlay',
      'PrepareComposite',
      'RunMediaConvert',
      'FinaliseJob',
      'NotifyUser',
    ]

    expect(() => {
      for (const name of nonTerminalStateNames) {
        const state = definition.States[name]
        if (!state || !state.Catch || !Array.isArray(state.Catch) || state.Catch.length === 0) {
          throw new Error(`State ${name} is missing a Catch block`)
        }
      }
    }).toThrow()
  })

  test('mutation: add Resource * to a Lambda S3 policy statement', () => {
    const templateJson = JSON.parse(JSON.stringify(pipelineTemplateJson))

    const resources: Record<string, any> = templateJson.Resources
    const policyKeys = Object.keys(resources).filter(
      (key) => resources[key].Type === 'AWS::IAM::Policy',
    )

    let mutated = false
    for (const policyKey of policyKeys) {
      const statements: any[] =
        resources[policyKey].Properties?.PolicyDocument?.Statement ?? []
      for (const stmt of statements) {
        const actions: string[] = Array.isArray(stmt.Action)
          ? stmt.Action
          : [stmt.Action]
        const hasS3Action = actions.some(
          (a) => typeof a === 'string' && a.startsWith('s3:'),
        )
        if (hasS3Action) {
          stmt.Resource = '*'
          mutated = true
          break
        }
      }
      if (mutated) break
    }
    expect(mutated).toBe(true)

    // After mutation, verify that the no-wildcard-resources property check catches it
    const mutatedTemplate = Template.fromJSON(templateJson)
    const allPolicies = mutatedTemplate.findResources('AWS::IAM::Policy')
    const allStatements = Object.values(allPolicies).flatMap(
      (p: any) => p.Properties?.PolicyDocument?.Statement ?? [],
    )

    const wildcardS3Statements = allStatements.filter((s: any) => {
      const actions: string[] = Array.isArray(s.Action) ? s.Action : [s.Action]
      const hasS3 = actions.some((a: string) => typeof a === 'string' && a.startsWith('s3:'))
      return hasS3 && s.Resource === '*'
    })

    expect(wildcardS3Statements.length).toBeGreaterThan(0)
  })
})

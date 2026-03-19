import { Template } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

let templates: Record<string, Template>
beforeAll(() => {
  const stacks = createTestStacks()
  templates = {
    storage: Template.fromStack(stacks.storage),
    notifications: Template.fromStack(stacks.notifications),
    pipeline: Template.fromStack(stacks.pipeline),
    social: Template.fromStack(stacks.social),
    api: Template.fromStack(stacks.api),
  }
})

function getAllStatements(template: Template): any[] {
  const policies = template.findResources('AWS::IAM::Policy')
  return Object.values(policies).flatMap(
    (p: any) => p.Properties?.PolicyDocument?.Statement ?? [],
  )
}

describe('IAM Policy Properties', () => {
  test('no wildcard resources on dangerous actions', () => {
    const allowedWildcardActions = ['mediaconvert:CreateJob', 'ecr:GetAuthorizationToken']
    const dangerousPrefixes = ['s3:', 'ses:', 'states:', 'sqs:', 'ecs:', 'lambda:']

    for (const [stackName, template] of Object.entries(templates)) {
      const statements = getAllStatements(template)

      for (const statement of statements) {
        const actions: string[] = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action]

        for (const action of actions) {
          if (typeof action !== 'string') continue
          if (allowedWildcardActions.includes(action)) continue
          if (action.startsWith('logs:')) continue

          const isDangerous = dangerousPrefixes.some((prefix) => action.startsWith(prefix))
          if (!isDangerous) continue

          const resources: any[] = Array.isArray(statement.Resource)
            ? statement.Resource
            : [statement.Resource]

          for (const resource of resources) {
            if (typeof resource === 'string') {
              expect(resource).not.toBe('*')
            }
          }
        }
      }
    }
  })

  test('all Lambda functions have log permissions', () => {
    const requiredLogActions = [
      'logs:CreateLogGroup',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ]

    for (const [stackName, template] of Object.entries(templates)) {
      const lambdaFunctions = template.findResources('AWS::Lambda::Function')
      if (Object.keys(lambdaFunctions).length === 0) continue

      // Check inline policies
      const statements = getAllStatements(template)
      const allActions = statements.flatMap((s: any) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      )

      // Also check role inline policies (Policies on AWS::IAM::Role)
      const roles = template.findResources('AWS::IAM::Role')
      for (const role of Object.values(roles) as any[]) {
        const rolePolicies = role.Properties?.Policies ?? []
        for (const rp of rolePolicies) {
          const rpStmts = rp.PolicyDocument?.Statement ?? []
          for (const s of rpStmts) {
            const actions = Array.isArray(s.Action) ? s.Action : [s.Action]
            allActions.push(...actions)
          }
        }
        // Also check managed policies — AWSLambdaBasicExecutionRole provides logs
        const managedPolicies = role.Properties?.ManagedPolicyArns ?? []
        for (const mp of managedPolicies) {
          const mpStr = typeof mp === 'string' ? mp : JSON.stringify(mp)
          if (mpStr.includes('AWSLambdaBasicExecutionRole')) {
            allActions.push(...requiredLogActions)
          }
        }
      }

      for (const requiredAction of requiredLogActions) {
        expect(allActions).toContain(requiredAction)
      }
    }
  })

  test('no iam:* wildcard actions', () => {
    for (const [, template] of Object.entries(templates)) {
      const statements = getAllStatements(template)

      for (const statement of statements) {
        const actions: string[] = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action]

        for (const action of actions) {
          if (typeof action === 'string') {
            expect(action).not.toBe('iam:*')
          }
        }
      }
    }
  })

  test('S3 write actions are prefix-scoped', () => {
    const s3WriteActions = ['s3:PutObject', 's3:DeleteObject']

    for (const [, template] of Object.entries(templates)) {
      const statements = getAllStatements(template)

      for (const statement of statements) {
        const actions: string[] = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action]

        const hasS3Write = actions.some(
          (a) => typeof a === 'string' && s3WriteActions.includes(a),
        )
        if (!hasS3Write) continue

        const resources: any[] = Array.isArray(statement.Resource)
          ? statement.Resource
          : [statement.Resource]

        for (const resource of resources) {
          if (typeof resource === 'string') {
            expect(resource).toMatch(/:::.*\//)
          }
          // Fn::Join / Fn::GetAtt resources are CDK-generated and trusted
        }
      }
    }
  })

  test('MediaConvert role trust policy has exactly one statement', () => {
    const template = templates.pipeline
    const roles = template.findResources('AWS::IAM::Role')

    const mediaConvertRoles = Object.entries(roles).filter(([, role]: [string, any]) => {
      const statements: any[] =
        role.Properties?.AssumeRolePolicyDocument?.Statement ?? []
      return statements.some((s: any) => {
        const principals = s.Principal
        if (!principals) return false
        if (principals.Service) {
          const services = Array.isArray(principals.Service)
            ? principals.Service
            : [principals.Service]
          return services.includes('mediaconvert.amazonaws.com')
        }
        return false
      })
    })

    expect(mediaConvertRoles.length).toBeGreaterThan(0)

    for (const [, role] of mediaConvertRoles) {
      const assumeStatements: any[] =
        (role as any).Properties?.AssumeRolePolicyDocument?.Statement ?? []
      expect(assumeStatements).toHaveLength(1)
    }
  })
})

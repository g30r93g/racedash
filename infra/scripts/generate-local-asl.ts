/**
 * Generates a LocalStack-compatible ASL definition from the CDK-synthesized
 * state machine definition. Patches:
 * 1. RunMediaConvert — replaced with a Pass state (LocalStack doesn't support MediaConvert)
 * 2. Lambda ARNs — rewritten to LocalStack's default account format
 */
import * as fs from 'fs'
import * as path from 'path'

const CDK_OUT = path.join(__dirname, '../cdk.out')
const OUTPUT_PATH = path.join(__dirname, '../localstack-init/state-machine.asl.json')

function findStateMachineDefinition(): any {
  const files = fs.readdirSync(CDK_OUT).filter((f) => f.endsWith('.template.json'))
  for (const file of files) {
    const template = JSON.parse(fs.readFileSync(path.join(CDK_OUT, file), 'utf8'))
    for (const [, resource] of Object.entries(template.Resources as Record<string, any>)) {
      if (resource.Type === 'AWS::StepFunctions::StateMachine') {
        const def = resource.Properties.DefinitionString
        if (typeof def === 'string') return JSON.parse(def)
        if (def?.['Fn::Join']) {
          const joined = def['Fn::Join'][1]
            .map((part: any) => (typeof part === 'string' ? part : ''))
            .join('')
          return JSON.parse(joined)
        }
      }
    }
  }
  throw new Error('No state machine definition found in cdk.out/')
}

function patchForLocalStack(definition: any): any {
  const states = definition.States

  // Patch RunMediaConvert → Pass state with mock output
  if (states.RunMediaConvert) {
    const nextState = states.RunMediaConvert.Next
    const catchers = states.RunMediaConvert.Catch
    states.RunMediaConvert = {
      Type: 'Pass',
      Comment: 'Mock MediaConvert — LocalStack does not support mediaconvert:createJob.sync',
      Result: {
        Job: {
          Id: 'mock-mediaconvert-job-id',
          Status: 'COMPLETE',
        },
      },
      ResultPath: '$.mediaConvertResult',
      Next: nextState,
    }
  }

  // Rewrite Lambda ARNs to LocalStack format
  const localAccountId = '000000000000'
  const localRegion = 'us-east-1'

  for (const [, state] of Object.entries(states as Record<string, any>)) {
    if (state.Resource && typeof state.Resource === 'string') {
      state.Resource = state.Resource.replace(
        /arn:aws:lambda:[^:]+:\d+:function:/g,
        `arn:aws:lambda:${localRegion}:${localAccountId}:function:`,
      )
    }
  }

  return definition
}

const definition = findStateMachineDefinition()
const patched = patchForLocalStack(definition)
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(patched, null, 2))
console.log(`Local ASL definition written to ${OUTPUT_PATH}`)

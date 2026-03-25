import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

export interface PipelineLambdaProps {
  functionName: string
  entry: string
  memorySize: number
  timeout: cdk.Duration
  environment: Record<string, string>
  additionalPolicies?: iam.PolicyStatement[]
  externalModules?: string[]
}

export class PipelineLambda extends Construct {
  public readonly function: lambdaNodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: PipelineLambdaProps) {
    super(scope, id)

    this.function = new lambdaNodejs.NodejsFunction(this, 'Handler', {
      functionName: props.functionName,
      entry: props.entry,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: props.memorySize,
      timeout: props.timeout,
      environment: props.environment,
      logGroup: new logs.LogGroup(this, 'LogGroup', {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: props.externalModules,
      },
    })

    if (props.additionalPolicies) {
      for (const policy of props.additionalPolicies) {
        this.function.addToRolePolicy(policy)
      }
    }
  }
}

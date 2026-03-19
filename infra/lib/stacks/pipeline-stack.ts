import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as events from 'aws-cdk-lib/aws-events'
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import * as path from 'path'
import { PipelineLambda } from '../constructs/pipeline-lambda'
import { getConfig, getContextParam } from '../config'
import { buildStateMachineDefinition } from '../state-machine-definition'

export interface PipelineStackProps extends cdk.StackProps {
  uploadsBucket: s3.IBucket
  rendersBucket: s3.IBucket
  cloudFrontDomain: string
  cloudFrontKeyPairId: string
  sesFromAddress: string
  sesIdentityArn: string
}

export class PipelineStack extends cdk.Stack {
  public readonly stateMachineArn: string

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props)

    const config = getConfig(this)
    const lambdasDir = path.join(__dirname, '../../lambdas')

    // CDK context params
    const databaseUrl = getContextParam(this, 'databaseUrl', '')
    const remotionWebhookSecret = getContextParam(this, 'remotionWebhookSecret', '')
    const remotionWebhookUrl = getContextParam(this, 'remotionWebhookUrl', '')
    const cloudFrontPrivateKeyPem = getContextParam(this, 'cloudFrontPrivateKeyPem', '')
    const webhookTargetUrl = getContextParam(this, 'webhookTargetUrl', '')
    const webhookSecret = getContextParam(this, 'webhookSecret', '')

    // Common env vars for all pipeline Lambdas
    const commonEnv: Record<string, string> = {
      DATABASE_URL: databaseUrl,
      S3_UPLOAD_BUCKET: props.uploadsBucket.bucketName,
      S3_RENDERS_BUCKET: props.rendersBucket.bucketName,
    }

    // Remotion site bucket
    const remotionSiteBucket = new s3.Bucket(this, 'RemotionSiteBucket', {
      bucketName: config.remotionSiteBucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Remotion Lambda function
    const remotionFunction = new lambda.Function(this, 'RemotionFunction', {
      functionName: `racedash-remotion-${config.env}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
      logRetention: logs.RetentionDays.ONE_MONTH,
    })

    // Remotion Lambda IAM
    remotionFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`${props.rendersBucket.bucketArn}/renders/*`],
    }))
    remotionFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${remotionSiteBucket.bucketArn}/*`],
    }))
    remotionFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${props.uploadsBucket.bucketArn}/uploads/*`],
    }))
    remotionFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [remotionFunction.functionArn],
    }))

    // MediaConvert IAM role
    const mediaConvertRole = new iam.Role(this, 'MediaConvertRole', {
      roleName: `RaceDashMediaConvertRole-${config.env}`,
      assumedBy: new iam.ServicePrincipal('mediaconvert.amazonaws.com'),
    })
    mediaConvertRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [
        `${props.rendersBucket.bucketArn}/renders/*/overlay.mov`,
        `${props.uploadsBucket.bucketArn}/uploads/*/joined.mp4`,
      ],
    }))
    mediaConvertRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`${props.rendersBucket.bucketArn}/renders/*/output.mp4`],
    }))

    // Pipeline Lambdas
    const waitForSlot = new PipelineLambda(this, 'WaitForSlotFunction', {
      functionName: `racedash-wait-for-slot-${config.env}`,
      entry: path.join(lambdasDir, 'wait-for-slot/index.ts'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    })

    const grantSlot = new PipelineLambda(this, 'GrantSlotFunction', {
      functionName: `racedash-grant-slot-${config.env}`,
      entry: path.join(lambdasDir, 'grant-slot/index.ts'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    })

    const startRenderOverlay = new PipelineLambda(this, 'StartRenderOverlayFunction', {
      functionName: `racedash-start-render-overlay-${config.env}`,
      entry: path.join(lambdasDir, 'start-render-overlay/index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonEnv,
        REMOTION_SERVE_URL: remotionSiteBucket.bucketWebsiteUrl || `https://${remotionSiteBucket.bucketName}.s3.amazonaws.com`,
        REMOTION_FUNCTION_NAME: remotionFunction.functionName,
        REMOTION_WEBHOOK_SECRET: remotionWebhookSecret,
        REMOTION_WEBHOOK_URL: remotionWebhookUrl,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [remotionFunction.functionArn],
        }),
      ],
    })

    const prepareComposite = new PipelineLambda(this, 'PrepareCompositeFunction', {
      functionName: `racedash-prepare-composite-${config.env}`,
      entry: path.join(lambdasDir, 'prepare-composite/index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        MEDIACONVERT_ROLE_ARN: mediaConvertRole.roleArn,
      },
    })

    const finaliseJob = new PipelineLambda(this, 'FinaliseJobFunction', {
      functionName: `racedash-finalise-job-${config.env}`,
      entry: path.join(lambdasDir, 'finalise-job/index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonEnv,
        CLOUDFRONT_DOMAIN: props.cloudFrontDomain,
        CLOUDFRONT_KEY_PAIR_ID: props.cloudFrontKeyPairId,
        CLOUDFRONT_PRIVATE_KEY_PEM: cloudFrontPrivateKeyPem,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: ['s3:DeleteObject'],
          resources: [`${props.uploadsBucket.bucketArn}/uploads/*`],
        }),
      ],
    })

    const notifyUser = new PipelineLambda(this, 'NotifyUserFunction', {
      functionName: `racedash-notify-user-${config.env}`,
      entry: path.join(lambdasDir, 'notify-user/index.ts'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        SES_FROM_ADDRESS: props.sesFromAddress,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [props.sesIdentityArn],
        }),
      ],
    })

    const releaseCreditsAndFail = new PipelineLambda(this, 'ReleaseCreditsAndFailFunction', {
      functionName: `racedash-release-credits-and-fail-${config.env}`,
      entry: path.join(lambdasDir, 'release-credits-and-fail/index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonEnv,
        SES_FROM_ADDRESS: props.sesFromAddress,
      },
      additionalPolicies: [
        new iam.PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [props.sesIdentityArn],
        }),
      ],
    })

    // State machine
    const definition = buildStateMachineDefinition(this, {
      waitForSlotFunction: waitForSlot.function,
      grantSlotFunction: grantSlot.function,
      startRenderOverlayFunction: startRenderOverlay.function,
      prepareCompositeFunction: prepareComposite.function,
      finaliseJobFunction: finaliseJob.function,
      notifyUserFunction: notifyUser.function,
      releaseCreditsAndFailFunction: releaseCreditsAndFail.function,
      mediaConvertRoleArn: mediaConvertRole.roleArn,
    })

    const stateMachine = new sfn.StateMachine(this, 'RenderPipelineStateMachine', {
      stateMachineName: `RenderPipeline-${config.env}`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.seconds(28800),
    })

    this.stateMachineArn = stateMachine.stateMachineArn

    // Grant callback permissions to Lambdas that need them
    const taskTokenPolicy = new iam.PolicyStatement({
      actions: ['states:SendTaskSuccess', 'states:SendTaskFailure'],
      resources: [stateMachine.stateMachineArn],
    })
    waitForSlot.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:SendTaskSuccess'],
      resources: [stateMachine.stateMachineArn],
    }))
    finaliseJob.function.addToRolePolicy(taskTokenPolicy)
    releaseCreditsAndFail.function.addToRolePolicy(taskTokenPolicy)

    // EventBridge rule for Step Functions terminal states
    const terminalStateRule = new events.Rule(this, 'StepFunctionsTerminalStateRule', {
      eventPattern: {
        source: ['aws.states'],
        detailType: ['Step Functions Execution Status Change'],
        detail: {
          stateMachineArn: [stateMachine.stateMachineArn],
          status: ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'],
        },
      },
    })

    // Relay Lambda
    const relayFunction = new lambdaNodejs.NodejsFunction(this, 'StepFunctionsRelayFunction', {
      functionName: `racedash-sfn-relay-${config.env}`,
      entry: path.join(lambdasDir, 'step-functions-relay/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        WEBHOOK_TARGET_URL: webhookTargetUrl,
        WEBHOOK_SECRET: webhookSecret,
      },
    })

    terminalStateRule.addTarget(new eventsTargets.LambdaFunction(relayFunction))

    // Stack outputs
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      exportName: `${config.env}-StateMachineArn`,
    })

    const pipelineLambdas = [
      { name: 'WaitForSlot', fn: waitForSlot },
      { name: 'GrantSlot', fn: grantSlot },
      { name: 'StartRenderOverlay', fn: startRenderOverlay },
      { name: 'PrepareComposite', fn: prepareComposite },
      { name: 'FinaliseJob', fn: finaliseJob },
      { name: 'NotifyUser', fn: notifyUser },
      { name: 'ReleaseCreditsAndFail', fn: releaseCreditsAndFail },
    ]
    for (const { name, fn } of pipelineLambdas) {
      new cdk.CfnOutput(this, `${name}FunctionArn`, {
        value: fn.function.functionArn,
        exportName: `${config.env}-${name}FunctionArn`,
      })
    }

    new cdk.CfnOutput(this, 'StepFunctionsRelayFunctionArn', {
      value: relayFunction.functionArn,
      exportName: `${config.env}-StepFunctionsRelayFunctionArn`,
    })
    new cdk.CfnOutput(this, 'RemotionFunctionName', {
      value: remotionFunction.functionName,
      exportName: `${config.env}-RemotionFunctionName`,
    })
    new cdk.CfnOutput(this, 'RemotionFunctionArn', {
      value: remotionFunction.functionArn,
      exportName: `${config.env}-RemotionFunctionArn`,
    })
    new cdk.CfnOutput(this, 'RemotionServeUrl', {
      value: remotionSiteBucket.bucketWebsiteUrl || `https://${remotionSiteBucket.bucketName}.s3.amazonaws.com`,
      exportName: `${config.env}-RemotionServeUrl`,
    })
    new cdk.CfnOutput(this, 'MediaConvertRoleArn', {
      value: mediaConvertRole.roleArn,
      exportName: `${config.env}-MediaConvertRoleArn`,
    })
  }
}

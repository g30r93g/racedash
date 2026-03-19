import * as cdk from 'aws-cdk-lib'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface StateMachineDefinitionProps {
  waitForSlotFunction: lambda.IFunction
  grantSlotFunction: lambda.IFunction
  startRenderOverlayFunction: lambda.IFunction
  prepareCompositeFunction: lambda.IFunction
  finaliseJobFunction: lambda.IFunction
  notifyUserFunction: lambda.IFunction
  releaseCreditsAndFailFunction: lambda.IFunction
  mediaConvertRoleArn: string
}

export function buildStateMachineDefinition(
  scope: Construct,
  props: StateMachineDefinitionProps,
): sfn.IChainable {
  // Terminal states
  const succeed = new sfn.Succeed(scope, 'Succeed', {
    comment: 'Pipeline completed successfully',
  })

  const fail = new sfn.Fail(scope, 'Fail', {
    error: 'RenderPipelineFailed',
    causePath: '$.error',
  })

  // ReleaseCreditsAndFail — catches all error paths
  const releaseCreditsAndFail = new tasks.LambdaInvoke(scope, 'ReleaseCreditsAndFail', {
    lambdaFunction: props.releaseCreditsAndFailFunction,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
      'userId.$': '$.userId',
      'error.$': '$.error',
    }),
    resultSelector: { 'statusCode.$': '$.Payload.statusCode' },
    resultPath: sfn.JsonPath.DISCARD,
  }).next(fail)

  // LogNotifyError — pass state for SES failures after job completes
  const logNotifyError = new sfn.Pass(scope, 'LogNotifyError', {
    comment: 'Log SES failure; job already complete — do NOT release credits',
  }).next(succeed)

  // NotifyUser
  const notifyUser = new tasks.LambdaInvoke(scope, 'NotifyUser', {
    lambdaFunction: props.notifyUserFunction,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
      'userId.$': '$.userId',
    }),
    resultPath: '$.notifyResult',
  })
  notifyUser.next(succeed)
  notifyUser.addCatch(logNotifyError, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  // FinaliseJob
  const finaliseJob = new tasks.LambdaInvoke(scope, 'FinaliseJob', {
    lambdaFunction: props.finaliseJobFunction,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
      'userId.$': '$.userId',
    }),
    resultPath: '$.finaliseResult',
  })
  finaliseJob.next(notifyUser)
  finaliseJob.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  // RunMediaConvert — SDK integration (sync)
  const stack = cdk.Stack.of(scope)
  const runMediaConvert = new tasks.CallAwsService(scope, 'RunMediaConvert', {
    service: 'mediaconvert',
    action: 'createJob',
    parameters: {
      'Role.$': '$.compositeResult.Payload.mediaConvertRoleArn',
      'Settings.$': '$.compositeResult.Payload.mediaConvertSettings',
    },
    iamResources: ['*'],
    iamAction: 'mediaconvert:CreateJob',
    additionalIamStatements: [
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [props.mediaConvertRoleArn],
      }),
      new iam.PolicyStatement({
        actions: ['events:PutTargets', 'events:PutRule', 'events:DescribeRule'],
        resources: [
          `arn:aws:events:${stack.region}:${stack.account}:rule/StepFunctionsGetEventsForMediaConvertJobRule`,
        ],
      }),
    ],
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    resultPath: '$.mediaConvertResult',
  })
  runMediaConvert.next(finaliseJob)
  runMediaConvert.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  // PrepareComposite
  const prepareComposite = new tasks.LambdaInvoke(scope, 'PrepareComposite', {
    lambdaFunction: props.prepareCompositeFunction,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
    }),
    resultPath: '$.compositeResult',
  })
  prepareComposite.next(runMediaConvert)
  prepareComposite.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  // StartRenderOverlay — .waitForTaskToken
  const startRenderOverlay = new tasks.LambdaInvoke(scope, 'StartRenderOverlay', {
    lambdaFunction: props.startRenderOverlayFunction,
    integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
      'userId.$': '$.userId',
      'taskToken.$': sfn.JsonPath.taskToken,
    }),
    heartbeatTimeout: sfn.Timeout.duration(cdk.Duration.seconds(900)),
    resultPath: '$.renderResult',
  })
  startRenderOverlay.next(prepareComposite)
  startRenderOverlay.addCatch(releaseCreditsAndFail, {
    errors: ['States.Heartbeat', 'States.TaskFailed'],
    resultPath: '$.error',
  })
  startRenderOverlay.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  // GrantSlot
  const grantSlot = new tasks.LambdaInvoke(scope, 'GrantSlot', {
    lambdaFunction: props.grantSlotFunction,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
    }),
    resultPath: '$.grantResult',
  })
  grantSlot.next(startRenderOverlay)
  grantSlot.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  // WaitForSlot — .waitForTaskToken
  const waitForSlot = new tasks.LambdaInvoke(scope, 'WaitForSlot', {
    lambdaFunction: props.waitForSlotFunction,
    integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    payload: sfn.TaskInput.fromObject({
      'jobId.$': '$.jobId',
      'userId.$': '$.userId',
      'taskToken.$': sfn.JsonPath.taskToken,
    }),
    heartbeatTimeout: sfn.Timeout.duration(cdk.Duration.seconds(21600)),
    resultPath: '$.slotResult',
  })
  waitForSlot.next(grantSlot)
  waitForSlot.addCatch(releaseCreditsAndFail, {
    errors: ['States.Heartbeat'],
    resultPath: '$.error',
  })
  waitForSlot.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  return waitForSlot
}

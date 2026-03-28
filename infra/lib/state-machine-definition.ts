import * as cdk from 'aws-cdk-lib'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import * as lambda from 'aws-cdk-lib/aws-lambda'
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

export function buildStateMachineDefinition(scope: Construct, props: StateMachineDefinitionProps): sfn.IChainable {
  // Terminal states
  const succeed = new sfn.Succeed(scope, 'Succeed', {
    comment: 'Pipeline completed successfully',
  })

  // $.error is an object from Catch blocks; causePath requires a string
  const fail = new sfn.Fail(scope, 'Fail', {
    error: 'RenderPipelineFailed',
    causePath: '$.error.Cause',
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
  // Uses CustomState because CallAwsService doesn't support RUN_JOB.
  // The .sync pattern uses arn:aws:states:::mediaconvert:createJob.sync
  const runMediaConvert = new sfn.CustomState(scope, 'RunMediaConvert', {
    stateJson: {
      Type: 'Task',
      Resource: 'arn:aws:states:::mediaconvert:createJob.sync',
      Parameters: {
        'Role.$': '$.compositeResult.Payload.mediaConvertRoleArn',
        'Settings.$': '$.compositeResult.Payload.mediaConvertSettings',
      },
      ResultPath: '$.mediaConvertResult',
    },
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
      taskToken: sfn.JsonPath.taskToken,
    }),
    heartbeatTimeout: sfn.Timeout.duration(cdk.Duration.seconds(900)),
    resultPath: '$.renderResult',
  })
  startRenderOverlay.next(prepareComposite)
  startRenderOverlay.addCatch(releaseCreditsAndFail, {
    errors: ['States.HeartbeatTimeout', 'States.TaskFailed'],
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
      taskToken: sfn.JsonPath.taskToken,
    }),
    heartbeatTimeout: sfn.Timeout.duration(cdk.Duration.seconds(21600)),
    resultPath: '$.slotResult',
  })
  waitForSlot.next(grantSlot)
  waitForSlot.addCatch(releaseCreditsAndFail, {
    errors: ['States.HeartbeatTimeout'],
    resultPath: '$.error',
  })
  waitForSlot.addCatch(releaseCreditsAndFail, {
    errors: ['States.ALL'],
    resultPath: '$.error',
  })

  return waitForSlot
}

import { SendTaskSuccessCommand, SendTaskFailureCommand } from '@aws-sdk/client-sfn'
import { sfn } from './aws-clients'

export async function sendTaskSuccess(taskToken: string, output: string = '{}'): Promise<void> {
  await sfn.send(new SendTaskSuccessCommand({ taskToken, output }))
}

export async function sendTaskFailure(taskToken: string, error: string, cause?: string): Promise<void> {
  await sfn.send(new SendTaskFailureCommand({ taskToken, error, cause }))
}

import { SendEmailCommand } from '@aws-sdk/client-ses'
import { ses } from './aws-clients'

export async function sendEmail(opts: {
  to: string
  subject: string
  body: string
}): Promise<void> {
  const from = process.env.SES_FROM_ADDRESS
  if (!from) throw new Error('SES_FROM_ADDRESS is required')

  await ses.send(new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [opts.to] },
    Message: {
      Subject: { Data: opts.subject },
      Body: { Text: { Data: opts.body } },
    },
  }))
}

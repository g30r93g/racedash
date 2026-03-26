import { describe, it, expect } from 'vitest'

// Mirrors the email templates from:
//   infra/lambdas/notify-user/index.ts (completion)
//   infra/lambdas/release-credits-and-fail/index.ts (failure)

function buildCompletionEmail(projectName: string) {
  return {
    subject: 'Your RaceDash render is ready',
    body: [
      `Hi,`,
      ``,
      `Your cloud render for "${projectName}" is complete and ready for download.`,
      ``,
      `The download will be available for 7 days. Open the RaceDash desktop app and navigate to the Cloud Renders tab to download your video.`,
      ``,
      `— RaceDash`,
    ].join('\n'),
  }
}

function buildFailureEmail(projectName: string, errorMessage: string) {
  return {
    subject: 'Your RaceDash render failed',
    body: [
      `Hi,`,
      ``,
      `Unfortunately, your cloud render for "${projectName}" has failed.`,
      ``,
      `Error: ${errorMessage}`,
      ``,
      `Your credits have been restored to your account balance. You can retry the render from the Export tab in the desktop app.`,
      ``,
      `— RaceDash`,
    ].join('\n'),
  }
}

describe('SES email template snapshots', () => {
  it('Completion email matches snapshot', () => {
    const email = buildCompletionEmail('Silverstone GP Onboard')

    expect(email).toMatchInlineSnapshot(`
      {
        "body": "Hi,

      Your cloud render for "Silverstone GP Onboard" is complete and ready for download.

      The download will be available for 7 days. Open the RaceDash desktop app and navigate to the Cloud Renders tab to download your video.

      — RaceDash",
        "subject": "Your RaceDash render is ready",
      }
    `)
  })

  it('Failure email matches snapshot', () => {
    const email = buildFailureEmail('Brands Hatch Sprint', 'Remotion render timed out after 300s')

    expect(email).toMatchInlineSnapshot(`
      {
        "body": "Hi,

      Unfortunately, your cloud render for "Brands Hatch Sprint" has failed.

      Error: Remotion render timed out after 300s

      Your credits have been restored to your account balance. You can retry the render from the Export tab in the desktop app.

      — RaceDash",
        "subject": "Your RaceDash render failed",
      }
    `)
  })
})

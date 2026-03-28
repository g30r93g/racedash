import { describe, it, expect } from 'vitest'

// Mirrors selectBitrateKbps and the MediaConvert config builder
// from infra/lambdas/prepare-composite/index.ts

function selectBitrateKbps(width: number): number {
  if (width >= 3840) return 50_000
  if (width >= 2560) return 30_000
  return 20_000
}

function buildMediaConvertConfig(opts: {
  jobId: string
  uploadBucket: string
  rendersBucket: string
  roleArn: string
  sourceWidth: number
}) {
  const bitrateKbps = selectBitrateKbps(opts.sourceWidth)

  return {
    mediaConvertRoleArn: opts.roleArn,
    mediaConvertSettings: {
      Inputs: [
        { FileInput: `s3://${opts.uploadBucket}/uploads/${opts.jobId}/joined.mp4` },
        { FileInput: `s3://${opts.rendersBucket}/renders/${opts.jobId}/overlay.mov` },
      ],
      OutputGroups: [
        {
          OutputGroupSettings: {
            Type: 'FILE_GROUP_SETTINGS',
            FileGroupSettings: {
              Destination: `s3://${opts.rendersBucket}/renders/${opts.jobId}/output`,
            },
          },
          Outputs: [
            {
              VideoDescription: {
                CodecSettings: {
                  Codec: 'H_264',
                  H264Settings: { Bitrate: bitrateKbps * 1000 },
                },
              },
              ContainerSettings: { Container: 'MP4' },
            },
          ],
        },
      ],
    },
  }
}

describe('MediaConvert config snapshot', () => {
  it('Matches snapshot for a 1080p source', () => {
    const config = buildMediaConvertConfig({
      jobId: 'job-fixed-1080p',
      uploadBucket: 'racedash-uploads',
      rendersBucket: 'racedash-renders',
      roleArn: 'arn:aws:iam::123456789012:role/MediaConvertRole',
      sourceWidth: 1920,
    })

    expect(config).toMatchInlineSnapshot(`
      {
        "mediaConvertRoleArn": "arn:aws:iam::123456789012:role/MediaConvertRole",
        "mediaConvertSettings": {
          "Inputs": [
            {
              "FileInput": "s3://racedash-uploads/uploads/job-fixed-1080p/joined.mp4",
            },
            {
              "FileInput": "s3://racedash-renders/renders/job-fixed-1080p/overlay.mov",
            },
          ],
          "OutputGroups": [
            {
              "OutputGroupSettings": {
                "FileGroupSettings": {
                  "Destination": "s3://racedash-renders/renders/job-fixed-1080p/output",
                },
                "Type": "FILE_GROUP_SETTINGS",
              },
              "Outputs": [
                {
                  "ContainerSettings": {
                    "Container": "MP4",
                  },
                  "VideoDescription": {
                    "CodecSettings": {
                      "Codec": "H_264",
                      "H264Settings": {
                        "Bitrate": 20000000,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      }
    `)
  })
})

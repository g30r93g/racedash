import { Template, Match } from 'aws-cdk-lib/assertions'
import { createTestStacks } from '../test-helper'

describe('StorageStack', () => {
  let template: Template

  beforeAll(() => {
    const { storage } = createTestStacks()
    template = Template.fromStack(storage)
  })

  test('uploads bucket exists with encryption AES256 and public access blocked', () => {
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      BucketName: Match.stringLikeRegexp('racedash-uploads'),
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    }))
  })

  test('uploads bucket has lifecycle rule with ExpirationInDays: 3 for prefix uploads/', () => {
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      BucketName: Match.stringLikeRegexp('racedash-uploads'),
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            ExpirationInDays: 3,
            Prefix: 'uploads/',
            Status: 'Enabled',
          }),
        ]),
      },
    }))
  })

  test('uploads bucket has AbortIncompleteMultipartUpload rule with DaysAfterInitiation: 1', () => {
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      BucketName: Match.stringLikeRegexp('racedash-uploads'),
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: 1,
            },
            Status: 'Enabled',
          }),
        ]),
      },
    }))
  })

  test('uploads bucket has CORS allowing PUT', () => {
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      BucketName: Match.stringLikeRegexp('racedash-uploads'),
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: Match.arrayWith(['PUT']),
          }),
        ]),
      },
    }))
  })

  test('renders bucket exists with encryption AES256 and public access blocked', () => {
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      BucketName: Match.stringLikeRegexp('racedash-renders'),
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    }))
  })

  test('renders bucket has lifecycle rule with ExpirationInDays: 7 for prefix renders/', () => {
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      BucketName: Match.stringLikeRegexp('racedash-renders'),
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            ExpirationInDays: 7,
            Prefix: 'renders/',
            Status: 'Enabled',
          }),
        ]),
      },
    }))
  })

  test('CloudFront distribution exists with PriceClass_100', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', Match.objectLike({
      DistributionConfig: Match.objectLike({
        PriceClass: 'PriceClass_100',
      }),
    }))
  })

  test('CloudFront distribution has TrustedKeyGroups on default cache behavior', () => {
    const resources = template.findResources('AWS::CloudFront::Distribution')
    const dist = Object.values(resources)[0]
    expect(dist.Properties.DistributionConfig.DefaultCacheBehavior.TrustedKeyGroups).toBeDefined()
    expect(dist.Properties.DistributionConfig.DefaultCacheBehavior.TrustedKeyGroups.length).toBeGreaterThan(0)
  })

  test('renders bucket has OAI bucket policy granting s3:GetObject', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:GetObject',
            Effect: 'Allow',
          }),
        ]),
      }),
    }))
  })

  test('CloudFront distribution uses OAI (has S3OriginConfig with OriginAccessIdentity)', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', Match.objectLike({
      DistributionConfig: Match.objectLike({
        Origins: Match.arrayWith([
          Match.objectLike({
            S3OriginConfig: Match.objectLike({
              OriginAccessIdentity: Match.anyValue(),
            }),
          }),
        ]),
      }),
    }))
  })

  test('stack exports UploadsBucketName, UploadsBucketArn, RendersBucketName, RendersBucketArn, CloudFrontDomain, CloudFrontKeyPairId', () => {
    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-UploadsBucketName'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-UploadsBucketArn'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-RendersBucketName'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-RendersBucketArn'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-CloudFrontDomain'),
      },
    }))

    template.hasOutput('*', Match.objectLike({
      Export: {
        Name: Match.stringLikeRegexp('test-CloudFrontKeyPairId'),
      },
    }))
  })
})

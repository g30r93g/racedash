import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { Construct } from 'constructs'
import { getConfig, getContextParam } from '../config'

export class StorageStack extends cdk.Stack {
  public readonly uploadsBucket: s3.Bucket
  public readonly rendersBucket: s3.Bucket
  public readonly cloudFrontDomain: string
  public readonly cloudFrontKeyPairId: string

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const config = getConfig(this)

    // Uploads bucket — ephemeral, presigned PUT from desktop
    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      bucketName: config.uploadsBucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      lifecycleRules: [
        {
          id: 'expire-uploads',
          prefix: 'uploads/',
          expiration: cdk.Duration.days(3),
        },
        {
          id: 'abort-incomplete-multipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Renders bucket — download window is 7 days
    this.rendersBucket = new s3.Bucket(this, 'RendersBucket', {
      bucketName: config.rendersBucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      lifecycleRules: [
        {
          id: 'expire-renders',
          prefix: 'renders/',
          expiration: cdk.Duration.days(7),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // CloudFront OAI for renders bucket
    const oai = new cloudfront.OriginAccessIdentity(this, 'RendersOAI', {
      comment: `OAI for ${config.rendersBucketName}`,
    })
    this.rendersBucket.grantRead(oai)

    // CloudFront signed URL key pair
    const publicKeyPem = getContextParam(this, 'cloudFrontPublicKeyPem', 'PLACEHOLDER_PUBLIC_KEY')
    const publicKey = new cloudfront.PublicKey(this, 'RendersSigningKey', {
      encodedKey: publicKeyPem,
    })
    const keyGroup = new cloudfront.KeyGroup(this, 'RendersKeyGroup', {
      items: [publicKey],
    })

    // CloudFront distribution over renders bucket
    const distribution = new cloudfront.Distribution(this, 'RendersDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.rendersBucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        trustedKeyGroups: [keyGroup],
        compress: true,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    })

    this.cloudFrontDomain = distribution.distributionDomainName
    this.cloudFrontKeyPairId = publicKey.publicKeyId

    // Stack outputs
    new cdk.CfnOutput(this, 'UploadsBucketName', {
      value: this.uploadsBucket.bucketName,
      exportName: `${config.env}-UploadsBucketName`,
    })
    new cdk.CfnOutput(this, 'UploadsBucketArn', {
      value: this.uploadsBucket.bucketArn,
      exportName: `${config.env}-UploadsBucketArn`,
    })
    new cdk.CfnOutput(this, 'RendersBucketName', {
      value: this.rendersBucket.bucketName,
      exportName: `${config.env}-RendersBucketName`,
    })
    new cdk.CfnOutput(this, 'RendersBucketArn', {
      value: this.rendersBucket.bucketArn,
      exportName: `${config.env}-RendersBucketArn`,
    })
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: this.cloudFrontDomain,
      exportName: `${config.env}-CloudFrontDomain`,
    })
    new cdk.CfnOutput(this, 'CloudFrontKeyPairId', {
      value: this.cloudFrontKeyPairId,
      exportName: `${config.env}-CloudFrontKeyPairId`,
    })
  }
}

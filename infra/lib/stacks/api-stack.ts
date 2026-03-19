import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import * as path from 'path'
import { getConfig, getContextParam } from '../config'

export interface ApiStackProps extends cdk.StackProps {
  uploadsBucket: s3.IBucket
  rendersBucket: s3.IBucket
  stateMachineArn: string
  socialUploadQueueArn: string
  socialUploadQueueUrl: string
  cloudFrontDomain: string
  cloudFrontKeyPairId: string
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const config = getConfig(this)

    // CDK context params
    const databaseUrlPooled = getContextParam(this, 'databaseUrlPooled', '')
    const clerkSecretKey = getContextParam(this, 'clerkSecretKey', '')
    const stripeSecretKey = getContextParam(this, 'stripeSecretKey', '')
    const stripeWebhookSecret = getContextParam(this, 'stripeWebhookSecret', '')
    const youtubeClientId = getContextParam(this, 'youtubeClientId', '')
    const youtubeClientSecret = getContextParam(this, 'youtubeClientSecret', '')
    const webhookSecret = getContextParam(this, 'webhookSecret', '')
    const remotionWebhookSecret = getContextParam(this, 'remotionWebhookSecret', '')
    const cloudFrontPrivateKeyPem = getContextParam(this, 'cloudFrontPrivateKeyPem', '')
    const tokenEncryptionKey = getContextParam(this, 'tokenEncryptionKey', '')

    // API Lambda
    const apiFunction = new lambdaNodejs.NodejsFunction(this, 'ApiFunction', {
      functionName: `racedash-api-${config.env}`,
      entry: path.join(__dirname, '../../../apps/api/dist/lambda.handler'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        CLERK_SECRET_KEY: clerkSecretKey,
        DATABASE_URL: databaseUrlPooled,
        AWS_REGION_NAME: cdk.Aws.REGION,
        S3_UPLOAD_BUCKET: props.uploadsBucket.bucketName,
        S3_RENDERS_BUCKET: props.rendersBucket.bucketName,
        CLOUDFRONT_DOMAIN: props.cloudFrontDomain,
        CLOUDFRONT_KEY_PAIR_ID: props.cloudFrontKeyPairId,
        CLOUDFRONT_PRIVATE_KEY_PEM: cloudFrontPrivateKeyPem,
        STEP_FUNCTIONS_STATE_MACHINE_ARN: props.stateMachineArn,
        STRIPE_SECRET_KEY: stripeSecretKey,
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
        YOUTUBE_CLIENT_ID: youtubeClientId,
        YOUTUBE_CLIENT_SECRET: youtubeClientSecret,
        SQS_SOCIAL_UPLOAD_QUEUE_URL: props.socialUploadQueueUrl,
        WEBHOOK_SECRET: webhookSecret,
        REMOTION_WEBHOOK_SECRET: remotionWebhookSecret,
        TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Function URL with no auth (Clerk handles auth at app level)
    const functionUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    // IAM: S3 uploads bucket (CRUD + multipart)
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
      resources: [`${props.uploadsBucket.bucketArn}/uploads/*`],
    }))
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:ListMultipartUploadParts', 's3:AbortMultipartUpload'],
      resources: [`${props.uploadsBucket.bucketArn}/uploads/*`],
    }))

    // IAM: S3 renders bucket (read only)
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${props.rendersBucket.bucketArn}/renders/*`],
    }))

    // IAM: Step Functions
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [props.stateMachineArn],
    }))
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:SendTaskSuccess', 'states:SendTaskFailure'],
      resources: [props.stateMachineArn],
    }))

    // IAM: SQS
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [props.socialUploadQueueArn],
    }))

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiFunctionArn', {
      value: apiFunction.functionArn,
      exportName: `${config.env}-ApiFunctionArn`,
    })
    new cdk.CfnOutput(this, 'ApiFunctionUrl', {
      value: functionUrl.url,
      exportName: `${config.env}-ApiFunctionUrl`,
    })
  }
}

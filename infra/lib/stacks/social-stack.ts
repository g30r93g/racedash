import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import * as path from 'path'
import { getConfig, getContextParam } from '../config'

export interface SocialStackProps extends cdk.StackProps {
  rendersBucket: s3.IBucket
  sesIdentityArn: string
  sesFromAddress: string
}

export class SocialStack extends cdk.Stack {
  public readonly queueUrl: string
  public readonly queueArn: string

  constructor(scope: Construct, id: string, props: SocialStackProps) {
    super(scope, id, props)

    const config = getConfig(this)
    const lambdasDir = path.join(__dirname, '../../lambdas')

    // CDK context params
    const databaseUrlDirect = getContextParam(this, 'databaseUrlDirect', '')
    const youtubeClientId = getContextParam(this, 'youtubeClientId', '')
    const youtubeClientSecret = getContextParam(this, 'youtubeClientSecret', '')
    const tokenEncryptionKey = getContextParam(this, 'tokenEncryptionKey', '')
    const taskSubnets = getContextParam(this, 'taskSubnets', '')
    const taskSecurityGroup = getContextParam(this, 'taskSecurityGroup', '')

    // ECS Fargate cluster
    const cluster = new ecs.Cluster(this, 'SocialCluster', {
      clusterName: `racedash-social-${config.env}`,
    })

    // Task definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'YouTubeUploadTaskDef', {
      family: `racedash-youtube-upload-${config.env}`,
      cpu: 512,
      memoryLimitMiB: 1024,
    })

    // Task role permissions
    taskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${props.rendersBucket.bucketArn}/renders/*`],
    }))
    taskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [props.sesIdentityArn],
    }))

    // Container (placeholder ECR image)
    taskDef.addContainer('YouTubeUploadContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/lambda/nodejs:20'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'youtube-upload',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        DATABASE_URL: databaseUrlDirect,
        S3_RENDERS_BUCKET: props.rendersBucket.bucketName,
        YOUTUBE_CLIENT_ID: youtubeClientId,
        YOUTUBE_CLIENT_SECRET: youtubeClientSecret,
        SES_FROM_ADDRESS: props.sesFromAddress,
        TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
      },
    })

    // SQS DLQ
    const dlq = new sqs.Queue(this, 'SocialUploadDLQ', {
      queueName: `racedash-social-uploads-dlq-${config.env}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    })

    // SQS queue
    const queue = new sqs.Queue(this, 'SocialUploadQueue', {
      queueName: `racedash-social-uploads-${config.env}`,
      visibilityTimeout: cdk.Duration.seconds(2700),
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    })

    this.queueUrl = queue.queueUrl
    this.queueArn = queue.queueArn

    // Dispatch Lambda
    const dispatchFunction = new lambdaNodejs.NodejsFunction(this, 'SocialDispatchFunction', {
      functionName: `racedash-social-dispatch-${config.env}`,
      entry: path.join(lambdasDir, 'social-dispatch/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        DATABASE_URL: databaseUrlDirect,
        YOUTUBE_TASK_DEFINITION_ARN: taskDef.taskDefinitionArn,
        ECS_CLUSTER_ARN: cluster.clusterArn,
        TASK_SUBNETS: taskSubnets,
        TASK_SECURITY_GROUP: taskSecurityGroup,
      },
    })

    // Dispatch Lambda IAM
    dispatchFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: [taskDef.taskDefinitionArn],
    }))
    dispatchFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        taskDef.executionRole!.roleArn,
        taskDef.taskRole.roleArn,
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ecs-tasks.amazonaws.com',
        },
      },
    }))

    // SQS triggers dispatch Lambda
    dispatchFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(queue, {
        batchSize: 1,
      }),
    )

    // Stack outputs
    new cdk.CfnOutput(this, 'SocialUploadQueueUrl', {
      value: queue.queueUrl,
      exportName: `${config.env}-SocialUploadQueueUrl`,
    })
    new cdk.CfnOutput(this, 'SocialUploadQueueArn', {
      value: queue.queueArn,
      exportName: `${config.env}-SocialUploadQueueArn`,
    })
    new cdk.CfnOutput(this, 'SocialClusterArn', {
      value: cluster.clusterArn,
      exportName: `${config.env}-SocialClusterArn`,
    })
    new cdk.CfnOutput(this, 'YouTubeUploadTaskDefArn', {
      value: taskDef.taskDefinitionArn,
      exportName: `${config.env}-YouTubeUploadTaskDefArn`,
    })
  }
}

#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { StorageStack } from '../lib/stacks/storage-stack'
import { NotificationsStack } from '../lib/stacks/notifications-stack'
import { PipelineStack } from '../lib/stacks/pipeline-stack'
import { SocialStack } from '../lib/stacks/social-stack'
import { ApiStack } from '../lib/stacks/api-stack'

const app = new cdk.App()
const env = app.node.tryGetContext('env') || 'dev'

const awsEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
}

const storage = new StorageStack(app, `StorageStack-${env}`, { env: awsEnv })
const notifications = new NotificationsStack(app, `NotificationsStack-${env}`, { env: awsEnv })

const pipeline = new PipelineStack(app, `PipelineStack-${env}`, {
  env: awsEnv,
  uploadsBucket: storage.uploadsBucket,
  rendersBucket: storage.rendersBucket,
  cloudFrontDomain: storage.cloudFrontDomain,
  cloudFrontKeyPairId: storage.cloudFrontKeyPairId,
  sesFromAddress: notifications.sesFromAddress,
  sesIdentityArn: notifications.sesIdentityArn,
})

const social = new SocialStack(app, `SocialStack-${env}`, {
  env: awsEnv,
  rendersBucket: storage.rendersBucket,
  sesIdentityArn: notifications.sesIdentityArn,
  sesFromAddress: notifications.sesFromAddress,
})

new ApiStack(app, `ApiStack-${env}`, {
  env: awsEnv,
  uploadsBucket: storage.uploadsBucket,
  rendersBucket: storage.rendersBucket,
  stateMachineArn: pipeline.stateMachineArn,
  socialUploadQueueArn: social.queueArn,
  socialUploadQueueUrl: social.queueUrl,
  cloudFrontDomain: storage.cloudFrontDomain,
  cloudFrontKeyPairId: storage.cloudFrontKeyPairId,
})

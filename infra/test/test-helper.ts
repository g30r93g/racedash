import * as cdk from 'aws-cdk-lib'
import { StorageStack } from '../lib/stacks/storage-stack'
import { NotificationsStack } from '../lib/stacks/notifications-stack'
import { PipelineStack } from '../lib/stacks/pipeline-stack'
import { SocialStack } from '../lib/stacks/social-stack'
import { ApiStack } from '../lib/stacks/api-stack'

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0YgX7RLEP3pXuH/i3OvR
vJCxjl9XobSXkwGmeICXoiSS0tOqXaJPc0IQxh2M3LoHGKnE3sp5ed6dPPfbGHCi
BthYMB9ITzCExNeSJGI7SZwSQSz/L2aSW4+o+dNkJ+L+LaRUPsViCsVp6ksOtMUz
eMfYd+3IbeRMOp3bclJBRMdkRa8LLCEWMS9rF2pJh6eLv5m8V6FPGUlw6Ao+6K1L
z0krBJN0WFkR7kzHhcEiM3sUVrOY4RocPvr4aI0rKMI7QOQB0d0+8bNRh6cCKqh2
Q2Cxcq2eVMEpT2fJSLO7pMgQQ8i9hrVUL/HsJw3MNMr8DwqRcxjwYuJDdYAn+q3l
3QIDAQAB
-----END PUBLIC KEY-----`

export interface TestStacks {
  app: cdk.App
  storage: StorageStack
  notifications: NotificationsStack
  pipeline: PipelineStack
  social: SocialStack
  api: ApiStack
}

export function createTestStacks(): TestStacks {
  const app = new cdk.App({
    context: {
      env: 'test',
      cloudFrontPublicKeyPem: TEST_PUBLIC_KEY,
      databaseUrl: 'postgresql://test:test@localhost:5432/test',
      databaseUrlPooled: 'postgresql://test:test@localhost:5432/test-pooled',
      databaseUrlDirect: 'postgresql://test:test@localhost:5432/test-direct',
      clerkSecretKey: 'sk_test_123',
      stripeSecretKey: 'sk_test_stripe_123',
      stripeWebhookSecret: 'whsec_test_123',
      youtubeClientId: 'yt-client-id',
      youtubeClientSecret: 'yt-client-secret',
      webhookSecret: 'webhook-secret-123',
      remotionWebhookSecret: 'remotion-secret-123',
      remotionWebhookUrl: 'https://api.example.com/webhooks/remotion',
      webhookTargetUrl: 'https://api.example.com/webhooks/sfn',
      cloudFrontPrivateKeyPem: 'PRIVATE_KEY_PEM_PLACEHOLDER',
      sesFromAddress: 'noreply@racedash.test',
      tokenEncryptionKey: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      taskSubnets: 'subnet-abc123',
      taskSecurityGroup: 'sg-abc123',
    },
  })

  const env: cdk.Environment = {
    account: '123456789012',
    region: 'us-east-1',
  }

  const storage = new StorageStack(app, 'StorageStack-test', { env })
  const notifications = new NotificationsStack(app, 'NotificationsStack-test', { env })

  const pipeline = new PipelineStack(app, 'PipelineStack-test', {
    env,
    uploadsBucket: storage.uploadsBucket,
    rendersBucket: storage.rendersBucket,
    cloudFrontDomain: storage.cloudFrontDomain,
    cloudFrontKeyPairId: storage.cloudFrontKeyPairId,
    sesFromAddress: notifications.sesFromAddress,
    sesIdentityArn: notifications.sesIdentityArn,
  })

  const social = new SocialStack(app, 'SocialStack-test', {
    env,
    rendersBucket: storage.rendersBucket,
    sesIdentityArn: notifications.sesIdentityArn,
    sesFromAddress: notifications.sesFromAddress,
  })

  const api = new ApiStack(app, 'ApiStack-test', {
    env,
    uploadsBucket: storage.uploadsBucket,
    rendersBucket: storage.rendersBucket,
    stateMachineArn: pipeline.stateMachineArn,
    socialUploadQueueArn: social.queueArn,
    socialUploadQueueUrl: social.queueUrl,
    cloudFrontDomain: storage.cloudFrontDomain,
    cloudFrontKeyPairId: storage.cloudFrontKeyPairId,
  })

  return { app, storage, notifications, pipeline, social, api }
}

/**
 * Replace non-deterministic asset hashes in CDK templates so snapshots
 * don't break when esbuild produces different bundles across runs.
 */
export function sanitizeTemplate(template: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(template)
  // Asset hashes are 64-char hex strings used in S3Key and asset references
  const sanitized = json.replace(/[0-9a-f]{64}/g, 'ASSET_HASH')
  return JSON.parse(sanitized)
}

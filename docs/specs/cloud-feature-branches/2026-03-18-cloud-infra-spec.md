# feature/cloud-infra — Feature Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-infra`
**Depends on:** nothing (runs in parallel with `cloud-db`)

---

## Overview

This branch creates the entire AWS infrastructure layer for RaceDash Cloud. It delivers five CDK stacks that provision S3 storage, a Step Functions render pipeline, SES notifications, the API Lambda, and the YouTube social upload infrastructure. All resource declarations, IAM roles, cross-stack wiring, and CDK construct definitions live here. No Lambda handler source code is included — handler code is owned by `feature/cloud-rendering` and `feature/cloud-youtube`.

---

## Scope

### In scope

- `infra/` directory: CDK app entry point, five stacks, shared constructs, configuration
- S3 buckets with lifecycle rules and encryption
- CloudFront distribution with signed URL support over the renders bucket
- Step Functions state machine (complete ASL definition with all states, transitions, error handling, timeouts, heartbeats)
- Lambda function constructs (placeholder handler paths — actual handler code is added by downstream branches)
- Remotion Lambda IAM role and site bucket
- MediaConvert IAM role
- SES identity and sending configuration
- EventBridge rule for Step Functions terminal state relay
- API Lambda function construct with Function URL
- ECS Fargate cluster, task definition, and SQS queue for YouTube uploads
- All IAM roles and policies with least-privilege scoping
- CDK snapshot and assertion tests

### Out of scope

- Lambda handler source code (owned by `feature/cloud-rendering`)
- YouTube Fargate task handler code (owned by `feature/cloud-youtube`)
- `apps/api` application code (owned by `feature/cloud-auth`)
- Database schema and migrations (owned by `feature/cloud-db`)
- Clerk, Stripe, or any application-level authentication/payment logic

---

## Functional Requirements

### FR-1: StorageStack

1. Create S3 bucket `racedash-uploads-{env}` with:
   - SSE-S3 encryption (AES-256)
   - Block all public access
   - Versioning disabled (uploads are ephemeral)
   - CORS allowing PUT from any origin (presigned upload from desktop)
   - Lifecycle rule: objects under `uploads/` prefix expire after 3 days (safety net; `FinaliseJob` deletes the specific upload object on completion)
2. Create S3 bucket `racedash-renders-{env}` with:
   - SSE-S3 encryption (AES-256)
   - Block all public access
   - Versioning disabled
   - Lifecycle rule: objects under `renders/` prefix expire after 7 days (matches the download window defined in the epic spec)
3. Create CloudFront distribution over `racedash-renders-{env}` with:
   - Origin Access Identity (OAI) granting read-only access to the renders bucket
   - RSA key pair for signed URLs (CloudFront key group)
   - Default behavior: signed URL required, HTTPS only
   - Price class: PriceClass_100 (US, Canada, Europe)
   - No caching on `/renders/*` path pattern (each render is unique, accessed once or twice)
4. Export bucket names, bucket ARNs, CloudFront domain, CloudFront key pair ID as stack outputs.

### FR-2: PipelineStack

1. Create the Step Functions state machine with the complete state definitions (see Section: Step Functions State Machine).
2. Create Lambda function constructs for each pipeline Lambda:
   - `WaitForSlotFunction` — 128 MB, 30s timeout
   - `GrantSlotFunction` — 128 MB, 30s timeout
   - `StartRenderOverlayFunction` — 256 MB, 60s timeout
   - `PrepareCompositeFunction` — 256 MB, 30s timeout
   - `FinaliseJobFunction` — 256 MB, 60s timeout
   - `NotifyUserFunction` — 128 MB, 30s timeout
   - `ReleaseCreditsAndFailFunction` — 256 MB, 60s timeout
3. Each Lambda uses Node.js 20.x runtime, arm64 architecture, and handler code path `infra/lambdas/{name}/index.handler` (placeholder — actual code added by `cloud-rendering`).
4. Create Remotion Lambda function (1024 MB, 120s timeout) and Remotion site bucket `racedash-remotion-site-{env}`.
5. Create MediaConvert IAM role `RaceDashMediaConvertRole-{env}` with permissions to read from uploads bucket and write to renders bucket.
6. State machine execution role requires:
   - `lambda:InvokeFunction` for all pipeline Lambdas
   - `mediaconvert:CreateJob` (resource: `*`)
   - `iam:PassRole` for the MediaConvert role ARN
7. Create EventBridge rule (`StepFunctionsTerminalStateRule`) matching Step Functions terminal states (`SUCCEEDED`, `FAILED`, `TIMED_OUT`, `ABORTED`) for the pipeline state machine. (Placed here instead of NotificationsStack to avoid circular dependency — see deviation note in NotificationsStack section.)
8. Create relay Lambda (`StepFunctionsRelayFunction`, 128 MB, 30s timeout) that POSTs terminal state events to `WEBHOOK_TARGET_URL` with `x-webhook-secret` header. `WEBHOOK_TARGET_URL` and `WEBHOOK_SECRET` are CDK context parameters with empty-string defaults — they are injected post-deploy once `cloud-rendering` has deployed the API endpoint.
9. Export state machine ARN, all Lambda function ARNs, Remotion function name, Remotion serve URL (site bucket URL), and MediaConvert role ARN as stack outputs.

### FR-3: NotificationsStack

1. Create SES email identity for the sending domain/address.
2. Export SES identity ARN and `SES_FROM_ADDRESS` as stack outputs.

> The EventBridge rule and relay Lambda are placed in **PipelineStack** (see FR-2 and the deviation note in the NotificationsStack section) to avoid a circular cross-stack dependency.

### FR-4: ApiStack

1. Create Lambda function for `apps/api`:
   - Runtime: Node.js 20.x, arm64
   - Memory: 512 MB
   - Timeout: 30s
   - Handler: `apps/api/dist/lambda.handler`
   - Lambda Function URL with `AuthType: NONE` (Clerk handles auth at the application level)
2. IAM execution role with permissions for:
   - `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on uploads bucket
   - `s3:GetObject` on renders bucket
   - `states:StartExecution` on the pipeline state machine ARN
   - `states:SendTaskSuccess`, `states:SendTaskFailure` on the pipeline state machine ARN (for Remotion webhook handler)
   - `sqs:SendMessage` on the social upload queue ARN
3. Environment variables injected from cross-stack references and CDK context (see Environment Variables section).
4. Export Lambda function ARN and Function URL as stack outputs.

### FR-5: SocialStack

1. Create ECS Fargate cluster `racedash-social-{env}`.
2. Create task definition `racedash-youtube-upload-{env}`:
   - 0.5 vCPU, 1 GB memory
   - Container image sourced from ECR (placeholder — image built by `cloud-youtube`)
   - Task execution role: pull from ECR, write CloudWatch Logs
   - Task role: `s3:GetObject` on renders bucket, `ses:SendEmail` for failure notifications
3. Create SQS queue `racedash-social-uploads-{env}`:
   - Visibility timeout: 900s (15 minutes — long enough for large YouTube uploads)
   - Message retention: 4 days
   - Dead-letter queue `racedash-social-uploads-dlq-{env}` with `maxReceiveCount: 3`
4. Create SQS dispatch Lambda (`SocialDispatchFunction`, 256 MB, 30s timeout):
   - Triggered by SQS queue
   - IAM: `ecs:RunTask` on the YouTube upload task definition, `iam:PassRole` for task execution and task roles
5. Export queue URL, queue ARN, Fargate cluster ARN, and task definition ARN as stack outputs.

---

## Non-Functional Requirements

### NFR-1: Cost

- All Lambda functions use arm64 (Graviton2) for lower per-ms cost.
- CloudFront uses PriceClass_100 to limit edge costs to US/Canada/Europe.
- No API Gateway — Lambda Function URL eliminates per-request Gateway charges.
- Step Functions uses Standard Workflows (not Express) — state transitions are billed per transition but the polling-free design minimizes transition count.
- Upload bucket lifecycle rules prevent unbounded storage growth.
- Fargate task uses 0.5 vCPU / 1 GB — minimal footprint for YouTube upload streaming.

### NFR-2: Security

- All S3 buckets block public access and use SSE-S3 encryption at rest.
- CloudFront distribution requires signed URLs — no anonymous access.
- All IAM roles follow least-privilege: actions are scoped to specific resource ARNs, not wildcards.
- Lambda environment variables for secrets (private keys, webhook secrets) are marked as `ssm:SecureString` or injected from AWS Secrets Manager references where possible. For phase 1 launch, CDK context parameters are acceptable with a note to migrate to Secrets Manager.
- SES is configured in sandbox mode initially; production access requested separately.

### NFR-3: Scalability

- Lambda concurrency is not artificially limited — AWS account defaults apply.
- Step Functions Standard Workflows support up to 25,000 concurrent executions per account.
- SQS queue provides natural backpressure for YouTube uploads.
- Fargate tasks scale independently of the render pipeline.

### NFR-4: Reliability

- All error paths in the state machine route to `ReleaseCreditsAndFail` to prevent credit leaks.
- SQS dead-letter queue captures persistently failing social upload messages.
- State machine has an 8-hour global timeout as a safety net.
- Heartbeat timeouts on callback states prevent indefinite execution hangs.

---

## Directory Structure

```
infra/
  bin/
    racedash.ts                      # CDK app entry point
  lib/
    stacks/
      storage-stack.ts               # StorageStack
      pipeline-stack.ts              # PipelineStack
      notifications-stack.ts         # NotificationsStack
      api-stack.ts                   # ApiStack
      social-stack.ts                # SocialStack
    constructs/
      pipeline-lambda.ts             # Shared L3 construct for pipeline Lambda functions
    config.ts                        # Environment-specific config (bucket names, etc.)
    state-machine-definition.ts      # Step Functions ASL definition builder
  lambdas/                           # Handler source directories (placeholder index.ts files)
    wait-for-slot/
      index.ts                       # Placeholder: exports handler = async () => {}
    grant-slot/
      index.ts
    start-render-overlay/
      index.ts
    prepare-composite/
      index.ts
    finalise-job/
      index.ts
    notify-user/
      index.ts
    release-credits-and-fail/
      index.ts
    step-functions-relay/
      index.ts
    social-dispatch/
      index.ts
  test/
    stacks/
      storage-stack.test.ts
      pipeline-stack.test.ts
      notifications-stack.test.ts
      api-stack.test.ts
      social-stack.test.ts
    properties/
      iam-policy-properties.test.ts
    mutations/
      mutation-tests.test.ts
    snapshots/
      __snapshots__/                 # Jest snapshot files (auto-generated)
  cdk.json
  tsconfig.json
  package.json
  jest.config.ts
```

---

## Stack Definitions

### StorageStack

**Resources:**

| Resource | CDK Construct | Logical ID |
|---|---|---|
| Uploads bucket | `s3.Bucket` | `UploadsBucket` |
| Renders bucket | `s3.Bucket` | `RendersBucket` |
| CloudFront OAI | `cloudfront.OriginAccessIdentity` | `RendersOAI` |
| CloudFront distribution | `cloudfront.Distribution` | `RendersDistribution` |
| CloudFront public key | `cloudfront.PublicKey` | `RendersSigningKey` |
| CloudFront key group | `cloudfront.KeyGroup` | `RendersKeyGroup` |

**IAM:**

- CloudFront OAI is granted `s3:GetObject` on `racedash-renders-{env}/renders/*` via bucket policy.
- No additional IAM roles created in this stack — consumer stacks create their own roles with cross-stack bucket references.

**Cross-stack outputs:**

| Output | Export Name | Value |
|---|---|---|
| `UploadsBucketName` | `{env}-UploadsBucketName` | Bucket name |
| `UploadsBucketArn` | `{env}-UploadsBucketArn` | Bucket ARN |
| `RendersBucketName` | `{env}-RendersBucketName` | Bucket name |
| `RendersBucketArn` | `{env}-RendersBucketArn` | Bucket ARN |
| `CloudFrontDomain` | `{env}-CloudFrontDomain` | Distribution domain name |
| `CloudFrontKeyPairId` | `{env}-CloudFrontKeyPairId` | Public key ID |

**Environment variables:** None (this stack only provides outputs consumed by other stacks).

---

### PipelineStack

**Constructor props (cross-stack):**

```ts
interface PipelineStackProps extends cdk.StackProps {
  uploadsBucket: s3.IBucket
  rendersBucket: s3.IBucket
  cloudFrontDomain: string
  cloudFrontKeyPairId: string
  sesFromAddress: string       // from NotificationsStack
  sesIdentityArn: string       // from NotificationsStack
}
```

**Resources:**

| Resource | CDK Construct | Logical ID |
|---|---|---|
| WaitForSlot Lambda | `PipelineLambda` (L3) | `WaitForSlotFunction` |
| GrantSlot Lambda | `PipelineLambda` (L3) | `GrantSlotFunction` |
| StartRenderOverlay Lambda | `PipelineLambda` (L3) | `StartRenderOverlayFunction` |
| PrepareComposite Lambda | `PipelineLambda` (L3) | `PrepareCompositeFunction` |
| FinaliseJob Lambda | `PipelineLambda` (L3) | `FinaliseJobFunction` |
| NotifyUser Lambda | `PipelineLambda` (L3) | `NotifyUserFunction` |
| ReleaseCreditsAndFail Lambda | `PipelineLambda` (L3) | `ReleaseCreditsAndFailFunction` |
| Remotion Lambda | `lambda.Function` | `RemotionFunction` |
| Remotion site bucket | `s3.Bucket` | `RemotionSiteBucket` |
| MediaConvert IAM role | `iam.Role` | `MediaConvertRole` |
| State machine | `sfn.StateMachine` | `RenderPipelineStateMachine` |
| EventBridge rule | `events.Rule` | `StepFunctionsTerminalStateRule` |
| Relay Lambda | `NodejsFunction` | `StepFunctionsRelayFunction` |

**`PipelineLambda` L3 construct (`infra/lib/constructs/pipeline-lambda.ts`):**

A reusable construct that creates a `lambda.Function` with shared defaults:

```ts
interface PipelineLambdaProps {
  functionName: string
  entry: string               // path to handler directory
  memorySize: number
  timeout: cdk.Duration
  environment: Record<string, string>
  additionalPolicies?: iam.PolicyStatement[]
}
```

Shared defaults applied by the construct:
- Runtime: `lambda.Runtime.NODEJS_20_X`
- Architecture: `lambda.Architecture.ARM_64`
- Log retention: 30 days
- Bundling: esbuild via `NodejsFunction` (from `aws-cdk-lib/aws-lambda-nodejs`)

**IAM roles and policies:**

1. **Pipeline Lambda execution roles** (one per Lambda, auto-created by `NodejsFunction`):

   All pipeline Lambdas share a common base policy:
   ```
   Effect: Allow
   Action: logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
   Resource: arn:aws:logs:{region}:{account}:log-group:/aws/lambda/{functionName}:*
   ```

   Additional per-Lambda policies:

   | Lambda | Additional actions | Resource scope |
   |---|---|---|
   | `WaitForSlotFunction` | `states:SendTaskSuccess` | State machine ARN |
   | `StartRenderOverlayFunction` | `lambda:InvokeFunction` | Remotion Lambda ARN |
   | `FinaliseJobFunction` | `states:SendTaskSuccess`, `states:SendTaskFailure`, `s3:DeleteObject` | State machine ARN; uploads bucket ARN + `/uploads/*` |
   | `NotifyUserFunction` | `ses:SendEmail` | SES identity ARN |
   | `ReleaseCreditsAndFailFunction` | `states:SendTaskSuccess`, `states:SendTaskFailure`, `ses:SendEmail` | State machine ARN; SES identity ARN |

2. **Remotion Lambda execution role:**
   ```
   Effect: Allow
   Action: s3:GetObject, s3:PutObject
   Resource: arn:aws:s3:::racedash-renders-{env}/renders/*

   Effect: Allow
   Action: s3:GetObject
   Resource: arn:aws:s3:::racedash-remotion-site-{env}/*

   Effect: Allow
   Action: s3:GetObject
   Resource: arn:aws:s3:::racedash-uploads-{env}/uploads/*

   Effect: Allow
   Action: lambda:InvokeFunction
   Resource: self (for Remotion chunk parallelism)
   ```

3. **MediaConvert IAM role** (`RaceDashMediaConvertRole-{env}`):
   ```
   Assumed by: mediaconvert.amazonaws.com

   Effect: Allow
   Action: s3:GetObject
   Resource: arn:aws:s3:::racedash-renders-{env}/renders/*/overlay.mov

   Effect: Allow
   Action: s3:GetObject
   Resource: arn:aws:s3:::racedash-uploads-{env}/uploads/*/joined.mp4

   Effect: Allow
   Action: s3:PutObject
   Resource: arn:aws:s3:::racedash-renders-{env}/renders/*/output.mp4
   ```

4. **State machine execution role:**
   ```
   Effect: Allow
   Action: lambda:InvokeFunction
   Resource: [all 7 pipeline Lambda ARNs]

   Effect: Allow
   Action: mediaconvert:CreateJob
   Resource: *

   Effect: Allow
   Action: iam:PassRole
   Resource: arn:aws:iam::{account}:role/RaceDashMediaConvertRole-{env}

   Effect: Allow
   Action: events:PutTargets, events:PutRule, events:DescribeRule
   Resource: arn:aws:events:{region}:{account}:rule/StepFunctionsGetEventsForMediaConvertJobRule
   ```
   The `events:*` permissions are required for the `mediaconvert:createJob.sync` SDK integration — Step Functions creates an internal EventBridge rule to wait for the MediaConvert job to complete.

**Environment variables injected into pipeline Lambdas:**

| Variable | Source | Injected into |
|---|---|---|
| `DATABASE_URL` | CDK context param | All pipeline Lambdas |
| `S3_UPLOAD_BUCKET` | `StorageStack.uploadsBucket.bucketName` | All pipeline Lambdas |
| `S3_RENDERS_BUCKET` | `StorageStack.rendersBucket.bucketName` | All pipeline Lambdas |
| `REMOTION_SERVE_URL` | Remotion site bucket URL | `StartRenderOverlayFunction` |
| `REMOTION_FUNCTION_NAME` | Remotion Lambda function name | `StartRenderOverlayFunction` |
| `REMOTION_WEBHOOK_SECRET` | CDK context param | `StartRenderOverlayFunction` |
| `REMOTION_WEBHOOK_URL` | CDK context param (empty default, set after `cloud-rendering` deploys) | `StartRenderOverlayFunction` |
| `MEDIACONVERT_ROLE_ARN` | `MediaConvertRole.roleArn` | `PrepareCompositeFunction` |
| `CLOUDFRONT_DOMAIN` | `StorageStack.cloudFrontDomain` | `FinaliseJobFunction` |
| `CLOUDFRONT_KEY_PAIR_ID` | `StorageStack.cloudFrontKeyPairId` | `FinaliseJobFunction` |
| `CLOUDFRONT_PRIVATE_KEY_PEM` | CDK context param | `FinaliseJobFunction` |
| `SES_FROM_ADDRESS` | `NotificationsStack.sesFromAddress` | `NotifyUserFunction`, `ReleaseCreditsAndFailFunction` |

**Cross-stack outputs:**

| Output | Export Name | Value |
|---|---|---|
| `StateMachineArn` | `{env}-StateMachineArn` | State machine ARN |
| `RemotionFunctionName` | `{env}-RemotionFunctionName` | Remotion Lambda function name |
| `RemotionServeUrl` | `{env}-RemotionServeUrl` | Remotion site bucket URL |
| `MediaConvertRoleArn` | `{env}-MediaConvertRoleArn` | MediaConvert role ARN |

---

### NotificationsStack

> **Deviation from epic spec:** The epic assigns the EventBridge rule and relay Lambda to NotificationsStack. However, this creates a circular dependency: NotificationsStack needs PipelineStack's state machine ARN (for the EventBridge rule pattern), while PipelineStack needs NotificationsStack's SES outputs. To eliminate multi-phase deploys, this spec moves the EventBridge rule and relay Lambda into **PipelineStack** (which already owns the state machine). NotificationsStack is reduced to SES resources only. This is a structural change from the epic's stack assignment, approved for implementation simplicity.

**Resources:**

| Resource | CDK Construct | Logical ID |
|---|---|---|
| SES email identity | `ses.EmailIdentity` | `RaceDashEmailIdentity` |

**Cross-stack outputs:**

| Output | Export Name | Value |
|---|---|---|
| `SesFromAddress` | `{env}-SesFromAddress` | Verified sender address |
| `SesIdentityArn` | `{env}-SesIdentityArn` | SES identity ARN |

#### EventBridge Rule & Relay Lambda (in PipelineStack)

The following resources are owned by **PipelineStack** (not NotificationsStack) per the deviation above:

| Resource | CDK Construct | Logical ID |
|---|---|---|
| EventBridge rule | `events.Rule` | `StepFunctionsTerminalStateRule` |
| Relay Lambda | `NodejsFunction` | `StepFunctionsRelayFunction` |

**EventBridge rule pattern:**

```json
{
  "source": ["aws.states"],
  "detail-type": ["Step Functions Execution Status Change"],
  "detail": {
    "stateMachineArn": ["{pipelineStateMachineArn}"],
    "status": ["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"]
  }
}
```

**Relay Lambda IAM:**
```
Effect: Allow
Action: logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
Resource: arn:aws:logs:{region}:{account}:log-group:/aws/lambda/StepFunctionsRelayFunction-{env}:*
```
No additional AWS service permissions needed — it simply POSTs to an HTTPS URL.

**Relay Lambda environment variables:**

| Variable | Source |
|---|---|
| `WEBHOOK_TARGET_URL` | CDK context param (empty string default) |
| `WEBHOOK_SECRET` | CDK context param (empty string default) |

---

### ApiStack

**Constructor props (cross-stack):**

```ts
interface ApiStackProps extends cdk.StackProps {
  uploadsBucket: s3.IBucket
  rendersBucket: s3.IBucket
  stateMachineArn: string
  socialUploadQueueArn: string
  socialUploadQueueUrl: string
  cloudFrontDomain: string
  cloudFrontKeyPairId: string
}
```

**Resources:**

| Resource | CDK Construct | Logical ID |
|---|---|---|
| API Lambda | `NodejsFunction` | `ApiFunction` |
| Lambda Function URL | `lambda.FunctionUrl` | `ApiFunctionUrl` |

**API Lambda IAM execution role:**

```
Effect: Allow
Action: s3:PutObject, s3:GetObject, s3:DeleteObject
Resource: arn:aws:s3:::racedash-uploads-{env}/uploads/*

Effect: Allow
Action: s3:ListMultipartUploadParts, s3:AbortMultipartUpload
Resource: arn:aws:s3:::racedash-uploads-{env}/uploads/*

Effect: Allow
Action: s3:GetObject
Resource: arn:aws:s3:::racedash-renders-{env}/renders/*

Effect: Allow
Action: states:StartExecution
Resource: {stateMachineArn}

Effect: Allow
Action: states:SendTaskSuccess, states:SendTaskFailure
Resource: {stateMachineArn}

Effect: Allow
Action: sqs:SendMessage
Resource: {socialUploadQueueArn}
```

**API Lambda environment variables:**

| Variable | Source |
|---|---|
| `CLERK_SECRET_KEY` | CDK context param |
| `DATABASE_URL` | CDK context param (Neon pooled) |
| `AWS_REGION` | CDK context (or `cdk.Aws.REGION`) |
| `S3_UPLOAD_BUCKET` | `StorageStack.uploadsBucket.bucketName` |
| `S3_RENDERS_BUCKET` | `StorageStack.rendersBucket.bucketName` |
| `CLOUDFRONT_DOMAIN` | `StorageStack.cloudFrontDomain` |
| `CLOUDFRONT_KEY_PAIR_ID` | `StorageStack.cloudFrontKeyPairId` |
| `CLOUDFRONT_PRIVATE_KEY_PEM` | CDK context param |
| `STEP_FUNCTIONS_STATE_MACHINE_ARN` | `PipelineStack.stateMachineArn` |
| `STRIPE_SECRET_KEY` | CDK context param |
| `STRIPE_WEBHOOK_SECRET` | CDK context param |
| `YOUTUBE_CLIENT_ID` | CDK context param |
| `YOUTUBE_CLIENT_SECRET` | CDK context param |
| `SQS_SOCIAL_UPLOAD_QUEUE_URL` | `SocialStack.queueUrl` |
| `WEBHOOK_SECRET` | CDK context param |
| `REMOTION_WEBHOOK_SECRET` | CDK context param |

**Cross-stack outputs:**

| Output | Export Name | Value |
|---|---|---|
| `ApiFunctionArn` | `{env}-ApiFunctionArn` | Lambda ARN |
| `ApiFunctionUrl` | `{env}-ApiFunctionUrl` | Function URL |

---

### SocialStack

**Resources:**

| Resource | CDK Construct | Logical ID |
|---|---|---|
| Fargate cluster | `ecs.Cluster` | `SocialCluster` |
| Task definition | `ecs.FargateTaskDefinition` | `YouTubeUploadTaskDef` |
| SQS queue | `sqs.Queue` | `SocialUploadQueue` |
| SQS DLQ | `sqs.Queue` | `SocialUploadDLQ` |
| Dispatch Lambda | `NodejsFunction` | `SocialDispatchFunction` |
| SQS event source | `SqsEventSource` | — |

**Task definition configuration:**
- CPU: 512 (0.5 vCPU)
- Memory: 1024 MB
- Container: placeholder ECR image URI (overridden by `cloud-youtube` at deploy time)
- Logging: CloudWatch Logs via `ecs.LogDrivers.awsLogs`

**Task execution role** (managed by CDK, for ECS infrastructure):
```
Effect: Allow
Action: ecr:GetAuthorizationToken, ecr:BatchCheckLayerAvailability, ecr:GetDownloadUrlForLayer, ecr:BatchGetImage
Resource: *

Effect: Allow
Action: logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
Resource: arn:aws:logs:{region}:{account}:log-group:/ecs/racedash-youtube-upload-{env}:*
```

**Task role** (application-level permissions for the container):
```
Effect: Allow
Action: s3:GetObject
Resource: arn:aws:s3:::racedash-renders-{env}/renders/*

Effect: Allow
Action: ses:SendEmail
Resource: {sesIdentityArn}
```

**Task role environment variables:**

| Variable | Source |
|---|---|
| `DATABASE_URL` | CDK context param (Neon direct non-pooled) |
| `S3_RENDERS_BUCKET` | `StorageStack.rendersBucket.bucketName` |
| `YOUTUBE_CLIENT_ID` | CDK context param |
| `YOUTUBE_CLIENT_SECRET` | CDK context param |
| `SES_FROM_ADDRESS` | `NotificationsStack.sesFromAddress` |

**Dispatch Lambda IAM:**
```
Effect: Allow
Action: ecs:RunTask
Resource: {taskDefinitionArn}

Effect: Allow
Action: iam:PassRole
Resource: [{taskExecutionRoleArn}, {taskRoleArn}]
```

**Cross-stack outputs:**

| Output | Export Name | Value |
|---|---|---|
| `SocialUploadQueueUrl` | `{env}-SocialUploadQueueUrl` | Queue URL |
| `SocialUploadQueueArn` | `{env}-SocialUploadQueueArn` | Queue ARN |
| `SocialClusterArn` | `{env}-SocialClusterArn` | Cluster ARN |
| `YouTubeUploadTaskDefArn` | `{env}-YouTubeUploadTaskDefArn` | Task definition ARN |

---

## Step Functions State Machine

Complete state definition outline. The state machine is defined using CDK's `sfn` module (L2 constructs), not raw ASL JSON.

```
StateMachine: RenderPipeline-{env}
  TimeoutSeconds: 28800 (8 hours)

States:

  WaitForSlot (Task — .waitForTaskToken)
    Resource: WaitForSlotFunction ARN
    HeartbeatSeconds: 21600 (6 hours)
    Parameters:
      jobId.$: $.jobId
      userId.$: $.userId
      taskToken.$: $$.Task.Token
    ResultPath: $.slotResult
    Next: GrantSlot
    Catch:
      - ErrorEquals: [States.Heartbeat]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error
      - ErrorEquals: [States.ALL]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error

  GrantSlot (Task — Lambda)
    Resource: GrantSlotFunction ARN
    Parameters:
      jobId.$: $.jobId
    ResultPath: $.grantResult
    Next: StartRenderOverlay
    Catch:
      - ErrorEquals: [States.ALL]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error

  StartRenderOverlay (Task — .waitForTaskToken)
    Resource: StartRenderOverlayFunction ARN
    HeartbeatSeconds: 900 (15 minutes)
    Parameters:
      jobId.$: $.jobId
      userId.$: $.userId
      taskToken.$: $$.Task.Token
    ResultPath: $.renderResult
    Next: PrepareComposite
    Catch:
      - ErrorEquals: [States.Heartbeat, States.TaskFailed]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error
      - ErrorEquals: [States.ALL]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error

  PrepareComposite (Task — Lambda)
    Resource: PrepareCompositeFunction ARN
    Parameters:
      jobId.$: $.jobId
    ResultPath: $.compositeResult
    Next: RunMediaConvert
    Catch:
      - ErrorEquals: [States.ALL]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error

  RunMediaConvert (Task — SDK integration, sync)
    Resource: arn:aws:states:::mediaconvert:createJob.sync
    Parameters:
      Role.$: $.compositeResult.mediaConvertRoleArn
      Settings.$: $.compositeResult.mediaConvertSettings
    ResultPath: $.mediaConvertResult
    Next: FinaliseJob
    Catch:
      - ErrorEquals: [States.ALL]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error

  FinaliseJob (Task — Lambda)
    Resource: FinaliseJobFunction ARN
    Parameters:
      jobId.$: $.jobId
      userId.$: $.userId
    ResultPath: $.finaliseResult
    Next: NotifyUser
    Catch:
      - ErrorEquals: [States.ALL]
        Next: ReleaseCreditsAndFail
        ResultPath: $.error

  NotifyUser (Task — Lambda)
    Resource: NotifyUserFunction ARN
    Parameters:
      jobId.$: $.jobId
      userId.$: $.userId
    ResultPath: $.notifyResult
    Next: Succeed
    Catch:
      - ErrorEquals: [States.ALL]
        Next: LogNotifyError
        ResultPath: $.error

  LogNotifyError (Pass)
    Comment: "Log SES failure; job already complete — do NOT release credits"
    Next: Succeed

  ReleaseCreditsAndFail (Task — Lambda)
    Resource: ReleaseCreditsAndFailFunction ARN
    Parameters:
      jobId.$: $.jobId
      userId.$: $.userId
      error.$: $.error
    Next: Fail

  Succeed (Succeed)
    Comment: "Pipeline completed successfully"

  Fail (Fail)
    Error: RenderPipelineFailed
    Cause.$: $.error
```

**Input schema** (passed by `StartExecution` from `apps/api`):

```ts
interface StateMachineInput {
  jobId: string
  userId: string
}
```

---

## S3 Lifecycle Rules

### `racedash-uploads-{env}`

| Rule ID | Prefix | Action | Days |
|---|---|---|---|
| `expire-uploads` | `uploads/` | `Expiration` | 3 |
| `abort-incomplete-multipart` | (entire bucket) | `AbortIncompleteMultipartUpload` | 1 |

Rationale: Uploads are ephemeral. The 3-day expiration is a safety net; `FinaliseJob` deletes the upload object immediately upon successful completion. The 1-day multipart abort rule cleans up abandoned multipart uploads from failed desktop connections.

### `racedash-renders-{env}`

| Rule ID | Prefix | Action | Days |
|---|---|---|---|
| `expire-renders` | `renders/` | `Expiration` | 7 |

Rationale: Download window is 7 days per the epic spec. Signed CloudFront URLs are generated fresh on each download request with validity capped at `download_expires_at`, so the S3 object expiry aligns exactly with the download window.

---

## CloudFront Configuration

**Distribution setup:**

| Property | Value |
|---|---|
| Origin | S3 bucket `racedash-renders-{env}` via OAI |
| Protocol policy | HTTPS only (redirect HTTP to HTTPS) |
| Viewer protocol policy | HTTPS only |
| Price class | `PriceClass_100` (US, Canada, Europe) |
| Default TTL | 0 (no caching) |
| Min TTL | 0 |
| Max TTL | 0 |
| Compress | true (gzip, brotli) |

**Signed URL key pair:**

- RSA key pair generated externally and provided to CDK as context parameters:
  - `cloudFrontPublicKeyPem`: PEM-encoded public key, used by CloudFront `PublicKey` resource
  - `CLOUDFRONT_PRIVATE_KEY_PEM`: PEM-encoded private key, injected as environment variable into `FinaliseJobFunction` and `ApiFunction`
- `cloudfront.PublicKey` created with the public key PEM
- `cloudfront.KeyGroup` created referencing the public key
- Distribution's default cache behavior uses `TrustedKeyGroups: [keyGroup]`

**Behaviors:**

| Path Pattern | Origin | Signed URL Required | Cache Policy |
|---|---|---|---|
| `/*` (default) | Renders bucket OAI | Yes (trusted key group) | CachingDisabled |

**Signed URL generation** (by `apps/api` at runtime, not by CDK):

```ts
// Generated by apps/api when GET /jobs/:id/download is called
const signedUrl = getSignedUrl({
  url: `https://${cloudFrontDomain}/renders/${jobId}/output.mp4`,
  keyPairId: cloudFrontKeyPairId,
  privateKey: cloudFrontPrivateKeyPem,
  dateLessThan: job.downloadExpiresAt.toISOString(),
})
```

---

## Success Criteria

1. `cdk synth` produces valid CloudFormation templates for all five stacks with zero errors.
2. `cdk deploy --all` creates all resources in a fresh AWS account/region without manual intervention (given required context parameters).
3. All S3 buckets are created with correct encryption, public access blocks, lifecycle rules, and CORS (uploads bucket only).
4. CloudFront distribution serves signed URLs over the renders bucket; unsigned requests return 403.
5. Step Functions state machine is created with all 10 states, correct transitions, error handlers, heartbeats, and the 8-hour global timeout.
6. All Lambda functions are created with correct runtimes (Node.js 20.x), architectures (arm64), memory sizes, timeouts, and environment variables.
7. MediaConvert IAM role is assumable by `mediaconvert.amazonaws.com` and scoped to the correct S3 paths.
8. State machine execution role has `mediaconvert:CreateJob`, `iam:PassRole`, `lambda:InvokeFunction`, and EventBridge permissions.
9. ECS Fargate cluster, task definition, SQS queue, and DLQ are created with correct configurations.
10. All cross-stack outputs are exported and consumable by downstream stacks.
11. All IAM policies use specific resource ARNs — no wildcard (`*`) resource on any action except `mediaconvert:CreateJob` (which does not support resource-level permissions) and ECR `GetAuthorizationToken` (which requires `*`).
12. All CDK assertion tests pass.
13. All CDK snapshot tests pass and produce stable snapshots.
14. Property-based tests confirm IAM invariants hold.

---

## User Stories

These user stories are written from the perspective of downstream branch engineers who consume this branch's outputs.

### US-1: cloud-rendering engineer

> As a `cloud-rendering` engineer, I can import the pipeline Lambda constructs and find my handler code paths pre-configured so that I only need to write the handler logic in `infra/lambdas/*/index.ts` without modifying CDK stack definitions.

### US-2: cloud-rendering engineer (state machine)

> As a `cloud-rendering` engineer, I can trigger a Step Functions execution with `{ jobId, userId }` and the state machine orchestrates the full render pipeline, invoking my Lambda handlers at each step in the correct order with the correct input payloads.

### US-3: cloud-rendering engineer (API Lambda)

> As a `cloud-rendering` engineer working on `apps/api`, I can deploy the API Lambda via the ApiStack and access all required environment variables (S3 buckets, state machine ARN, CloudFront config) without modifying CDK code.

### US-4: cloud-youtube engineer

> As a `cloud-youtube` engineer, I can find the SQS queue URL and Fargate task definition ARN in the SocialStack outputs, write my dispatch Lambda and Fargate task handler code, and deploy without modifying infrastructure definitions.

### US-5: cloud-auth engineer

> As a `cloud-auth` engineer, I can deploy the `apps/api` scaffold to the ApiStack's Lambda function and access the Function URL for integration testing.

### US-6: cloud-rendering engineer (signed URLs)

> As a `cloud-rendering` engineer, I can generate signed CloudFront URLs using the key pair ID and private key PEM from the StorageStack outputs, and those URLs grant time-limited access to render outputs.

### US-7: cloud-rendering engineer (notifications)

> As a `cloud-rendering` engineer, I can see that the EventBridge relay Lambda will POST to my webhook URL once I set `WEBHOOK_TARGET_URL` and `WEBHOOK_SECRET` context parameters and re-deploy.

---

## UI Mocks to Produce

None. This is a pure infrastructure branch with no user-facing UI.

---

## Happy Paths

### HP-1: Clean deployment

1. Engineer runs `cd infra && pnpm cdk synth`.
2. CDK synthesizes all five stacks into CloudFormation templates in `cdk.out/`.
3. Engineer runs `pnpm cdk deploy --all` with required context parameters.
4. All stacks deploy successfully. S3 buckets, CloudFront, Step Functions, Lambdas, SES, ECS, and SQS resources are created.
5. Stack outputs are visible in CloudFormation console and consumable by other stacks.

### HP-2: Incremental re-deploy after cloud-rendering lands

1. `cloud-rendering` has deployed and the API webhook endpoint is live.
2. Engineer sets `WEBHOOK_TARGET_URL` and `WEBHOOK_SECRET` context parameters.
3. Engineer runs `pnpm cdk deploy PipelineStack-{env}` (or whichever stack owns the relay Lambda).
4. Relay Lambda's environment variables are updated. EventBridge terminal state events now relay to the API.

### HP-3: State machine execution (infrastructure validation)

1. Engineer manually starts a Step Functions execution with `{ "jobId": "test-123", "userId": "user-456" }`.
2. Execution enters `WaitForSlot` and the placeholder Lambda is invoked.
3. All states are reachable via the defined transitions.
4. Error paths correctly route to `ReleaseCreditsAndFail`.
5. The execution completes (with placeholder Lambda responses) or times out as expected.

---

## Security Considerations

### SEC-1: IAM least privilege

- Every IAM role is scoped to the minimum actions and resources required.
- No IAM policy uses `Resource: "*"` except where the AWS API requires it (`mediaconvert:CreateJob`, `ecr:GetAuthorizationToken`).
- Pipeline Lambdas that call `SendTaskSuccess`/`SendTaskFailure` are scoped to the specific state machine ARN.
- MediaConvert role is scoped to specific S3 key prefixes, not entire buckets.

### SEC-2: Encryption at rest

- All S3 buckets use SSE-S3 (AES-256) encryption.
- SQS queues use SSE-SQS encryption (AWS-managed keys).
- CloudWatch Logs are encrypted with AWS-managed keys.

### SEC-3: Encryption in transit

- CloudFront enforces HTTPS-only viewer and origin protocol policies.
- Lambda Function URLs use HTTPS by default.
- All AWS SDK calls use HTTPS (default).

### SEC-4: Public access prevention

- All S3 buckets have `BlockPublicAccess.BLOCK_ALL` enabled.
- Renders bucket is only accessible via CloudFront OAI (no direct S3 access).
- Lambda Function URL has `AuthType: NONE` but Clerk middleware enforces auth at the application level (owned by `cloud-auth`).

### SEC-5: Secret management

- Phase 1: Secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `CLOUDFRONT_PRIVATE_KEY_PEM`, etc.) are passed as CDK context parameters and stored as Lambda environment variables (encrypted at rest by AWS Lambda using AWS-managed KMS keys).
- Phase 2 (future improvement): Migrate to AWS Secrets Manager or SSM Parameter Store SecureString with Lambda runtime resolution. This is acceptable tech debt for launch.

### SEC-6: Key rotation

- CloudFront RSA signing key pair: rotated manually. CDK supports updating the public key and creating a new key group. The old key group can be removed after all outstanding signed URLs expire (7-day max window).
- MediaConvert and other IAM roles use AWS-managed credentials (no static keys to rotate).

---

## Infrastructure

This IS the infrastructure branch. The deployment strategy is as follows.

### Deployment order

Due to cross-stack dependencies, stacks must be deployed in this order:

1. **StorageStack** and **NotificationsStack** — no dependencies, deploy in parallel
2. **PipelineStack** — depends on StorageStack outputs (buckets) and NotificationsStack outputs (SES)
3. **SocialStack** — depends on StorageStack outputs (renders bucket) and NotificationsStack outputs (SES)
4. **ApiStack** — depends on StorageStack, PipelineStack, and SocialStack outputs

CDK handles this ordering automatically when using `cdk deploy --all` because cross-stack references create implicit CloudFormation dependencies.

### Environment strategy

| Environment | AWS Account | Purpose |
|---|---|---|
| `dev` | Development account | Engineer testing, CI |
| `prod` | Production account | Live traffic |

The `env` parameter is passed as a CDK context variable: `cdk deploy -c env=dev`.

### CDK app entry point (`infra/bin/racedash.ts`)

```ts
const env = app.node.tryGetContext('env') || 'dev'

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
```

### CI/CD

- CDK synth runs on every PR to validate templates.
- CDK deploy is triggered manually or via CI on merge to the deployment branch.
- `cdk diff` is run before deploy to review changes.

---

## API Contracts

This branch does not define REST API endpoints (those are owned by `cloud-auth` and `cloud-rendering`). The API contracts for this branch are the **CDK stack outputs** consumed by downstream branches.

### Stack Outputs (CDK → CloudFormation Exports)

| Export Name | Type | Producing Stack | Consuming Branches |
|---|---|---|---|
| `{env}-UploadsBucketName` | string | StorageStack | cloud-rendering, cloud-auth |
| `{env}-UploadsBucketArn` | string | StorageStack | cloud-rendering |
| `{env}-RendersBucketName` | string | StorageStack | cloud-rendering, cloud-youtube |
| `{env}-RendersBucketArn` | string | StorageStack | cloud-rendering, cloud-youtube |
| `{env}-CloudFrontDomain` | string | StorageStack | cloud-rendering |
| `{env}-CloudFrontKeyPairId` | string | StorageStack | cloud-rendering |
| `{env}-StateMachineArn` | string | PipelineStack | cloud-rendering |
| `{env}-RemotionFunctionName` | string | PipelineStack | cloud-rendering |
| `{env}-RemotionServeUrl` | string | PipelineStack | cloud-rendering |
| `{env}-MediaConvertRoleArn` | string | PipelineStack | cloud-rendering |
| `{env}-SesFromAddress` | string | NotificationsStack | cloud-rendering, cloud-youtube |
| `{env}-SesIdentityArn` | string | NotificationsStack | cloud-rendering, cloud-youtube |
| `{env}-ApiFunctionArn` | string | ApiStack | cloud-auth |
| `{env}-ApiFunctionUrl` | string | ApiStack | cloud-auth, desktop |
| `{env}-SocialUploadQueueUrl` | string | SocialStack | cloud-youtube |
| `{env}-SocialUploadQueueArn` | string | SocialStack | cloud-youtube |
| `{env}-SocialClusterArn` | string | SocialStack | cloud-youtube |
| `{env}-YouTubeUploadTaskDefArn` | string | SocialStack | cloud-youtube |

### CDK Context Parameters (inputs)

| Parameter | Required | Default | Used by |
|---|---|---|---|
| `env` | Yes | `dev` | All stacks |
| `databaseUrl` | Yes | — | PipelineStack (pipeline Lambdas) |
| `databaseUrlPooled` | Yes | — | ApiStack |
| `databaseUrlDirect` | Yes | — | SocialStack (Fargate task) |
| `clerkSecretKey` | Yes | — | ApiStack |
| `stripeSecretKey` | Yes | — | ApiStack |
| `stripeWebhookSecret` | Yes | — | ApiStack |
| `youtubeClientId` | Yes | — | ApiStack, SocialStack |
| `youtubeClientSecret` | Yes | — | ApiStack, SocialStack |
| `webhookSecret` | Yes | — | ApiStack, PipelineStack (relay Lambda) |
| `remotionWebhookSecret` | Yes | — | PipelineStack, ApiStack |
| `remotionWebhookUrl` | No | `""` | PipelineStack |
| `webhookTargetUrl` | No | `""` | PipelineStack (relay Lambda) |
| `cloudFrontPublicKeyPem` | Yes | — | StorageStack |
| `cloudFrontPrivateKeyPem` | Yes | — | PipelineStack, ApiStack |
| `sesFromAddress` | Yes | — | NotificationsStack |

---

## Tests

All tests live in `infra/test/` and use Jest with `aws-cdk-lib/assertions`.

### Specification Tests

CDK assertion tests that verify each stack creates the expected resources with the correct properties.

**`infra/test/stacks/storage-stack.test.ts`:**

1. Uploads bucket exists with `BucketEncryption: S3Managed`, `PublicAccessBlockConfiguration` all true.
2. Uploads bucket has lifecycle rule with `ExpirationInDays: 3` on prefix `uploads/`.
3. Uploads bucket has `AbortIncompleteMultipartUpload` rule with `DaysAfterInitiation: 1`.
4. Uploads bucket has CORS rule allowing `PUT` method.
5. Renders bucket exists with `BucketEncryption: S3Managed`, `PublicAccessBlockConfiguration` all true.
6. Renders bucket has lifecycle rule with `ExpirationInDays: 7` on prefix `renders/`.
7. CloudFront distribution exists with `PriceClass: PriceClass_100`.
8. CloudFront distribution has a trusted key group on the default cache behavior.
9. CloudFront distribution uses the renders bucket as its origin via OAI.
10. Stack exports `UploadsBucketName`, `UploadsBucketArn`, `RendersBucketName`, `RendersBucketArn`, `CloudFrontDomain`, `CloudFrontKeyPairId`.

**`infra/test/stacks/pipeline-stack.test.ts`:**

1. State machine exists with `TimeoutSeconds: 28800`.
2. Seven pipeline Lambda functions exist with correct runtimes (`nodejs20.x`), architectures (`arm64`), and memory sizes.
3. `WaitForSlotFunction` has `HeartbeatSeconds: 21600` in the state machine definition.
4. `StartRenderOverlayFunction` has `HeartbeatSeconds: 900` in the state machine definition.
5. State machine definition contains all 10 states: `WaitForSlot`, `GrantSlot`, `StartRenderOverlay`, `PrepareComposite`, `RunMediaConvert`, `FinaliseJob`, `NotifyUser`, `LogNotifyError`, `ReleaseCreditsAndFail`, `Succeed`.
6. `RunMediaConvert` state uses resource `arn:aws:states:::mediaconvert:createJob.sync`.
7. MediaConvert IAM role has trust policy for `mediaconvert.amazonaws.com`.
8. State machine execution role has `mediaconvert:CreateJob`, `iam:PassRole`, and `lambda:InvokeFunction` permissions.
9. `FinaliseJobFunction` has `states:SendTaskSuccess` and `states:SendTaskFailure` permissions.
10. `ReleaseCreditsAndFailFunction` has `states:SendTaskSuccess`, `states:SendTaskFailure`, and `ses:SendEmail` permissions.
11. Remotion Lambda function exists with 1024 MB memory.
12. Remotion site bucket exists.
13. EventBridge rule exists matching Step Functions terminal states.
14. Relay Lambda exists with `WEBHOOK_TARGET_URL` and `WEBHOOK_SECRET` environment variables.
15. Stack exports `StateMachineArn`, `RemotionFunctionName`, `RemotionServeUrl`, `MediaConvertRoleArn`.

**`infra/test/stacks/notifications-stack.test.ts`:**

1. SES email identity exists.
2. Stack exports `SesFromAddress` and `SesIdentityArn`.

**`infra/test/stacks/api-stack.test.ts`:**

1. API Lambda function exists with runtime `nodejs20.x`, architecture `arm64`, memory 512 MB, timeout 30s.
2. Lambda Function URL exists with `AuthType: NONE`.
3. API Lambda execution role has `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on uploads bucket.
4. API Lambda execution role has `s3:GetObject` on renders bucket.
5. API Lambda execution role has `states:StartExecution` on state machine ARN.
6. API Lambda execution role has `states:SendTaskSuccess`, `states:SendTaskFailure` on state machine ARN.
7. API Lambda execution role has `sqs:SendMessage` on social upload queue ARN.
8. API Lambda has all required environment variables set.
9. Stack exports `ApiFunctionArn` and `ApiFunctionUrl`.

**`infra/test/stacks/social-stack.test.ts`:**

1. ECS Fargate cluster exists.
2. Task definition exists with CPU 512, memory 1024.
3. SQS queue exists with `VisibilityTimeout: 900`, `MessageRetentionPeriod: 345600` (4 days).
4. DLQ exists with `maxReceiveCount: 3` on the redrive policy.
5. Dispatch Lambda exists and is triggered by the SQS queue.
6. Dispatch Lambda has `ecs:RunTask` permission on the task definition.
7. Task role has `s3:GetObject` on renders bucket and `ses:SendEmail` on SES identity.
8. Stack exports queue URL, queue ARN, cluster ARN, task definition ARN.

### Property-Based Tests

**`infra/test/properties/iam-policy-properties.test.ts`:**

These tests synthesize all stacks and inspect every IAM policy statement across all templates to verify invariants.

1. **No wildcard resources on dangerous actions:** For actions matching `s3:*`, `ses:*`, `states:*`, `sqs:*`, `ecs:*`, `lambda:*`, verify that `Resource` is never `"*"`. Exceptions: `mediaconvert:CreateJob` (does not support resource-level permissions), `ecr:GetAuthorizationToken` (requires `*`), `logs:CreateLogGroup` (acceptable with scoped log group ARN pattern).
2. **All Lambda functions have log permissions:** Every Lambda function's execution role includes `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`.
3. **No `iam:*` wildcard actions:** No policy statement uses `Action: "iam:*"`. Only `iam:PassRole` is allowed and must be scoped to a specific role ARN.
4. **S3 write actions are prefix-scoped:** Any policy with `s3:PutObject` or `s3:DeleteObject` must have a `Resource` that includes a prefix path (not just the bucket ARN).
5. **MediaConvert role trust policy:** The MediaConvert role's `AssumeRolePolicyDocument` has exactly one statement with `Principal.Service: mediaconvert.amazonaws.com`.

### Mutation / Genetic Modification Tests

These tests verify that deliberately introducing a mutation causes a test failure. Each mutation is described as a code change that, if applied, must cause at least one test to fail.

**`infra/test/mutations/mutation-tests.test.ts`:**

1. **Remove S3 encryption:** If `encryption: s3.BucketEncryption.S3_MANAGED` is removed from any bucket, the specification test asserting `BucketEncryption` must fail.
2. **Remove public access block:** If `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL` is removed, the specification test asserting `PublicAccessBlockConfiguration` must fail.
3. **Widen MediaConvert role to `s3:*`:** If the MediaConvert role's S3 actions are changed from specific actions to `s3:*`, the property-based test for no-wildcard-actions must fail.
4. **Remove heartbeat from WaitForSlot:** If `HeartbeatSeconds` is removed from the `WaitForSlot` state, the pipeline specification test asserting heartbeat presence must fail.
5. **Remove Catch from StartRenderOverlay:** If the `Catch` block is removed from `StartRenderOverlay`, the specification test verifying all non-terminal states have error handlers must fail.
6. **Change state machine timeout:** If `TimeoutSeconds` is changed from `28800` to any other value, the specification test must fail.
7. **Remove signed URL requirement from CloudFront:** If `TrustedKeyGroups` is removed from the default cache behavior, the specification test must fail.
8. **Add `Resource: "*"` to a Lambda's S3 policy:** If any S3 permission is changed to `Resource: "*"`, the property-based test for prefix-scoped S3 writes must fail.

These mutation tests are documented as comments in the test file. The actual test assertions in the specification and property-based tests are what catch these mutations — the mutation test file serves as a registry of mutations that the test suite is expected to catch, with a test per mutation that programmatically applies the mutation to a synthesized template copy and verifies the corresponding assertion test would fail.

### Characterisation Tests

**Snapshot tests** that capture the full synthesized CloudFormation template for each stack. These tests detect unintended drift.

Location: `infra/test/snapshots/` (Jest snapshots stored in `__snapshots__/`).

1. `storage-stack.snapshot.test.ts` — Snapshot of `StorageStack` template.
2. `pipeline-stack.snapshot.test.ts` — Snapshot of `PipelineStack` template.
3. `notifications-stack.snapshot.test.ts` — Snapshot of `NotificationsStack` template.
4. `api-stack.snapshot.test.ts` — Snapshot of `ApiStack` template.
5. `social-stack.snapshot.test.ts` — Snapshot of `SocialStack` template.

Each test synthesizes the stack with fixed context parameters and calls `expect(template.toJSON()).toMatchSnapshot()`. When a legitimate change is made, snapshots are updated with `pnpm test -- -u`.

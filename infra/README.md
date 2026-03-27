# @racedash/infra

AWS CDK infrastructure for RaceDash Cloud. Defines all AWS resources and the Step Functions render pipeline.

## Overview

Five CDK stacks and ten Lambda functions covering the full cloud render pipeline: upload, render, composite, notify, and social upload. LocalStack is used for local integration testing.

## Local Development

LocalStack provides a local emulation of the AWS services used by the API. It is started automatically by `pnpm local:up` from the monorepo root — you do not need to run it separately unless writing infra integration tests.

### Running infra integration tests

```bash
cd infra
pnpm localstack:up        # Start LocalStack (standalone container)
pnpm test:local           # Run LocalStack integration tests
pnpm test:local:watch     # Watch mode (LocalStack must already be running)
pnpm localstack:down      # Stop container
```

### CDK commands

```bash
pnpm --filter @racedash/infra synth    # Synthesise CloudFormation templates
pnpm --filter @racedash/infra deploy   # Deploy to AWS (requires AWS credentials)
pnpm --filter @racedash/infra diff     # Show diff vs deployed stack
```

### Build

```bash
pnpm --filter @racedash/infra build
```

## Architecture

### Stacks

| Stack | Purpose |
|---|---|
| `StorageStack` | S3 uploads + renders buckets, CloudFront distribution with signed URLs |
| `NotificationsStack` | SES email identity |
| `PipelineStack` | Step Functions state machine + pipeline Lambda functions |
| `ApiStack` | API Lambda (`racedash-api-{env}`), Lambda Function URL, IAM roles |
| `SocialStack` | SQS queue + `social-dispatch` Lambda for YouTube uploads |

### Pipeline Lambdas (Step Functions)

| Lambda | Purpose |
|---|---|
| `wait-for-slot` | Checks concurrent render slot availability |
| `grant-slot` | Reserves a render slot |
| `start-render-overlay` | Triggers Remotion Lambda render |
| `step-functions-relay` | Receives Remotion webhook and resumes the state machine |
| `prepare-composite` | Downloads overlay, triggers AWS MediaConvert composite job |
| `finalise-job` | Marks job complete, generates signed CloudFront download URL |
| `notify-user` | Sends SES email notification |
| `release-credits-and-fail` | Error handler — releases credit reservation and marks job failed |
| `social-dispatch` | Processes SQS messages for YouTube uploads |
| `api` | Placeholder handler referenced by ApiStack |

### State machine flow

`WaitForSlot` → `GrantSlot` → `StartRenderOverlay` → (Remotion webhook) → `PrepareComposite` → (MediaConvert) → `FinaliseJob` → `NotifyUser` → Succeed

Any step failure routes to `ReleaseCreditsAndFail` → Fail.

### LocalStack initialisation

`localstack-init/` contains scripts that run on LocalStack startup to create S3 buckets, SQS queues, an SES identity, and the Step Functions state machine. These are also used by the monorepo-level `pnpm local:up`.

## Testing

```bash
# Unit tests (no LocalStack)
pnpm --filter @racedash/infra test

# Integration tests (requires LocalStack)
pnpm --filter @racedash/infra test:local
```

Unit tests use Jest with `ts-jest`. Integration tests run against live LocalStack endpoints using the AWS SDK.

## Deployment / Productionising

Requires AWS credentials with CDK bootstrap already completed. Sensitive values (database URL, Clerk key, Stripe key, etc.) are passed as CDK context parameters — never stored in `cdk.json`.

```bash
cdk deploy --all \
  --context databaseUrl=... \
  --context clerkSecretKey=... \
  --context stripeSecretKey=... \
  # ... other context params
```

See `lib/config.ts` and each stack for the full list of required context parameters.

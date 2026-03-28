# cloud-infra — Deferred Work

**Date:** 2026-03-19
**Status:** Pending
**Branch:** `feature/cloud-infra`
**When:** After main epic body of work is complete, before production deploy

---

## 1. Add `iam:PassedToService` condition to all `iam:PassRole` statements

**Files:** `infra/lib/stacks/pipeline-stack.ts`, `infra/lib/stacks/social-stack.ts`

Add `conditions: { StringEquals: { 'iam:PassedToService': '...' } }` to:
- State machine execution role's PassRole for MediaConvert → `mediaconvert.amazonaws.com`
- Dispatch Lambda's PassRole for ECS task roles → `ecs-tasks.amazonaws.com`

Security hardening; no runtime breakage without it.

---

## 2. Gate `RemovalPolicy.DESTROY` on environment

**Files:** `infra/lib/stacks/storage-stack.ts`, `infra/lib/stacks/pipeline-stack.ts`

All three S3 buckets (`UploadsBucket`, `RendersBucket`, `RemotionSiteBucket`) unconditionally use `RemovalPolicy.DESTROY` + `autoDeleteObjects: true`. Change to `RemovalPolicy.RETAIN` when `config.env === 'prod'`.

---

## 3. Split snapshot tests into per-stack files

**File:** `infra/test/snapshots/snapshot-tests.test.ts`

Spec requires 5 individual files:
- `storage-stack.snapshot.test.ts`
- `pipeline-stack.snapshot.test.ts`
- `notifications-stack.snapshot.test.ts`
- `api-stack.snapshot.test.ts`
- `social-stack.snapshot.test.ts`

Current implementation is a single file. Functionally equivalent but deviates from spec layout.

---

## 4. Add mutation test #5 and its prerequisite spec test

**File:** `infra/test/mutations/mutation-tests.test.ts`, `infra/test/stacks/pipeline-stack.test.ts`

Missing mutation: "Remove Catch from StartRenderOverlay — must fail a specification test verifying all non-terminal states have error handlers."

Prerequisite: add a pipeline-stack spec test that asserts every non-terminal state (WaitForSlot, GrantSlot, StartRenderOverlay, PrepareComposite, RunMediaConvert, FinaliseJob, NotifyUser) has a Catch block.

---

## 5. Complete LocalStack Step Functions tests (4 of 6 missing)

**File:** `infra/test/localstack/step-functions.localstack.test.ts`

Missing test cases (require `state-machine.asl.json` to exist — see critical work):
- `WaitForSlot` callback pauses execution until `SendTaskSuccess`
- `SendTaskSuccess` on WaitForSlot task token advances to `GrantSlot`
- State machine reaches `Succeed` when all callbacks resolved
- Routes to `ReleaseCreditsAndFail` on callback timeout

---

## 6. Add SQS DLQ-after-max-receives LocalStack test

**File:** `infra/test/localstack/sqs-dispatch.localstack.test.ts`

Missing: "Message with invalid format ends up in DLQ after max receives."

---

## 7. Add EventBridge relay Lambda invocation assertion

**File:** `infra/test/localstack/eventbridge-relay.localstack.test.ts`

Current test only asserts `PutEvents` succeeds. Missing: verify the relay Lambda was actually invoked with the correct event payload (check CloudWatch Logs or Lambda invocation count via LocalStack API).

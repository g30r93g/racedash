#!/bin/bash
set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="us-east-1"

echo "=== RaceDash LocalStack Bootstrap ==="

# S3 Buckets
awslocal s3 mb s3://racedash-uploads-local --region "$REGION"
awslocal s3 mb s3://racedash-renders-local --region "$REGION"

# S3 lifecycle rules
awslocal s3api put-bucket-lifecycle-configuration \
  --bucket racedash-uploads-local \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-uploads",
        "Prefix": "uploads/",
        "Status": "Enabled",
        "Expiration": { "Days": 3 }
      },
      {
        "ID": "abort-incomplete-multipart",
        "Status": "Enabled",
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
      }
    ]
  }'

awslocal s3api put-bucket-lifecycle-configuration \
  --bucket racedash-renders-local \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-renders",
        "Prefix": "renders/",
        "Status": "Enabled",
        "Expiration": { "Days": 7 }
      }
    ]
  }'

# SQS DLQ
awslocal sqs create-queue \
  --queue-name racedash-social-upload-dlq-local \
  --region "$REGION"

DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url "http://sqs.$REGION.localhost.localstack.cloud:4566/000000000000/racedash-social-upload-dlq-local" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

# SQS Queue
awslocal sqs create-queue \
  --queue-name racedash-social-upload-local \
  --region "$REGION" \
  --attributes '{
    "VisibilityTimeout": "2700",
    "MessageRetentionPeriod": "345600",
    "RedrivePolicy": "{\"maxReceiveCount\":3,\"deadLetterTargetArn\":\"'"$DLQ_ARN"'\"}"
  }'

# SES Email Identity
awslocal ses verify-email-identity \
  --email-address "test@racedash.local" \
  --region "$REGION"

# Step Functions State Machine (from local ASL definition if available)
if [ -f /etc/localstack/init/ready.d/state-machine.asl.json ]; then
  awslocal stepfunctions create-state-machine \
    --name "RenderPipeline-local" \
    --definition file:///etc/localstack/init/ready.d/state-machine.asl.json \
    --role-arn "arn:aws:iam::000000000000:role/localstack-sfn-role" \
    --region "$REGION" || true
fi

# Write .env.localstack
cat > /tmp/.env.localstack << ENV
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_UPLOAD_BUCKET=racedash-uploads-local
S3_RENDERS_BUCKET=racedash-renders-local
SQS_SOCIAL_UPLOAD_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/racedash-social-upload-local
STEP_FUNCTIONS_STATE_MACHINE_ARN=arn:aws:states:us-east-1:000000000000:stateMachine:RenderPipeline-local
SES_FROM_ADDRESS=test@racedash.local
ENV

echo "=== LocalStack bootstrap complete ==="

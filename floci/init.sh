#!/usr/bin/env sh

echo "Waiting for Floci to be ready..."
until aws sqs list-queues > /dev/null 2>&1; do
  sleep 1
done
echo "Floci is ready. Configuring S3, SQS and SNS..."

echo "Creating S3 buckets..."
aws s3 mb s3://cdp-uploader-quarantine
aws s3 mb s3://fcp-sfd-object-processor-bucket

echo "Creating SQS queues..."

# CDP Uploader queues
aws sqs create-queue --queue-name cdp-clamav-results
aws sqs create-queue --queue-name cdp-uploader-download-requests
aws sqs create-queue --queue-name cdp-uploader-scan-results-callback.fifo \
  --attributes '{"FifoQueue":"true","ContentBasedDeduplication":"true"}'

# SFD messaging
aws sns create-topic --name fcp_sfd_object_processor_events
aws sqs create-queue --queue-name fcp_sfd_crm_requests
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:eu-west-2:000000000000:fcp_sfd_crm_requests

# Test harness
aws sqs create-queue --queue-name mock-clamav
aws s3api put-bucket-notification-configuration \
  --bucket cdp-uploader-quarantine \
  --notification-configuration '{
    "QueueConfigurations": [
      {
        "QueueArn": "arn:aws:sqs:eu-west-2:000000000000:mock-clamav",
        "Events": ["s3:ObjectCreated:*"]
      }
    ]
  }'

echo "S3, SQS and SNS configuration complete."

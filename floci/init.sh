#!/usr/bin/env sh

echo "Waiting for Floci to be ready..."
until aws sqs list-queues > /dev/null 2>&1; do
  sleep 1
done
echo "Floci is ready"

echo "Configuring S3, SQS and SNS"
echo "============================="

AWS_REGION=${AWS_REGION:-eu-west-2}
ACCOUNT_ID=000000000000

# Create S3 buckets
echo "Creating S3 buckets..."
aws s3 mb s3://cdp-uploader-quarantine --region "${AWS_REGION}"
aws s3 mb s3://fcp-sfd-object-processor-bucket --region "${AWS_REGION}"

# Create SQS queues
echo "Creating SQS queues..."
aws sqs create-queue --queue-name cdp-clamav-results --region "${AWS_REGION}"
aws sqs create-queue --queue-name cdp-uploader-download-requests --region "${AWS_REGION}"
aws sqs create-queue --queue-name cdp-uploader-scan-results-callback.fifo \
  --attributes '{"FifoQueue":"true","ContentBasedDeduplication":"true"}' \
  --region "${AWS_REGION}"

# Create SNS topic and SQS queue for SFD events
echo "Creating SNS topics and subscriptions..."
aws sns create-topic --name fcp_sfd_object_processor_events --region "${AWS_REGION}"

# Create SFD CRM requests queue
aws sqs create-queue --queue-name fcp_sfd_crm_requests --region "${AWS_REGION}"

# Subscribe SFD CRM queue to SNS topic
aws sns subscribe \
  --topic-arn "arn:aws:sns:${AWS_REGION}:${ACCOUNT_ID}:fcp_sfd_object_processor_events" \
  --protocol sqs \
  --notification-endpoint "arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:fcp_sfd_crm_requests" \
  --region "${AWS_REGION}"

# Create mock ClamAV queue for testing
echo "Creating test mock queues..."
aws sqs create-queue --queue-name mock-clamav --region "${AWS_REGION}"

# Configure S3 bucket notifications
echo "Configuring S3 bucket notifications..."
aws s3api put-bucket-notification-configuration \
  --bucket cdp-uploader-quarantine \
  --notification-configuration '{
    "QueueConfigurations": [
      {
        "QueueArn": "arn:aws:sqs:'"${AWS_REGION}"':'"${ACCOUNT_ID}"':mock-clamav",
        "Events": ["s3:ObjectCreated:*"]
      }
    ]
  }' \
  --region "${AWS_REGION}"

echo "Done! S3, SQS and SNS configured."

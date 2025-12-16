#!/bin/bash
echo "[INIT SCRIPT] Starting LocalStack setup" >&2

echo "[INIT SCRIPT] Creating buckets" >&2

aws --endpoint-url=http://localhost:4566 s3 mb s3://cdp-uploader-quarantine
aws --endpoint-url=http://localhost:4566 s3 mb s3://fcp-sfd-object-processor-bucket


echo "[INIT SCRIPT] Creating queues" >&2

# cdp uploader queues
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-clamav-results
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-uploader-scan-results-callback.fifo --attributes "{\"FifoQueue\":\"true\",\"ContentBasedDeduplication\": \"true\"}"
# sfd messaging queues
aws --endpoint-url=http://localhost:4566 sns create-topic --name fcp_sfd_object_processor_events
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name fcp_sfd_crm_requests
aws --endpoint-url=http://localhost:4566 sns subscribe --topic-arn arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events --protocol sqs --notification-endpoint arn:aws:sqs:eu-west-2:000000000000:fcp_sfd_crm_requests


# test harness
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name mock-clamav
aws --endpoint-url=http://localhost:4566 s3api put-bucket-notification-configuration\
    --bucket cdp-uploader-quarantine \
    --notification-configuration '{
                                      "QueueConfigurations": [
                                         {
                                           "QueueArn": "arn:aws:sqs:eu-west-2:000000000000:mock-clamav",
                                           "Events": ["s3:ObjectCreated:*"]
                                         }
                                       ]
	                                }'

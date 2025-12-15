export const messagingConfig = {
  messaging: {
    documentUploadEvents: {
      topicArn: {
        doc: 'ARN (Amazon Resource Name) for the document upload SNS topic to which document upload events are published',
        format: String,
        default: null,
        env: 'DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN'
      }
    }
  }
}

import { PublishBatchCommand } from '@aws-sdk/client-sns'

const publishBatch = async (snsClient, topicArn, batch) => {
  const params = {
    TopicArn: topicArn,
    PublishBatchRequestEntries: JSON.stringify(batch)
  }

  const command = new PublishBatchCommand(params)

  await snsClient.send(command)
}

export { publishBatch }

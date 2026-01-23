import { PublishBatchCommand } from '@aws-sdk/client-sns'

const publishBatch = async (snsClient, topicArn, batch) => {
  const params = {
    TopicArn: topicArn,
    PublishBatchRequestEntries: batch.map(message => ({
      Id: message.id, // mapping the messageId to Id for SNS because the response include this Id which we can use for updating our databases
      Message: JSON.stringify(message)
    }))
  }

  const command = new PublishBatchCommand(params)

  const response = await snsClient.send(command)

  return response
}

export { publishBatch }

// Statuses: 'pending', 'sent', 'failed'
// find documents in outbox collection with status 'pending'
// use mongo transaction
// send the events via SNS
// update the outbox status to 'sent' or 'failed' based on result

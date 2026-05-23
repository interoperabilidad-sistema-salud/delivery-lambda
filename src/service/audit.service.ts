import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSRecord } from 'aws-lambda';
import { AuditRecord, AuditStatus } from '../types/dynamodb.types.js'
import { Bundle } from '../types/sqs.types.js';

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
);

const TABLE_NAME = 'interop-sgsss-transfers-dev';

export async function saveAuditRecord(params: {
  record: SQSRecord;
  status: AuditStatus;
  payload?: Bundle;
  startTime: number;
  error?: Error;
}): Promise<void> {
  const { record, status, payload, startTime, error } = params;

  const now = new Date().toISOString();
  const processingTimeMs = Date.now() - startTime;

  const queueName = record.eventSourceARN.split(':').at(-1) ?? 'unknown';

  const auditItem: AuditRecord = {
    id: `AUDIT#${record.messageId}`,
    timestamp: now,
    messageId: record.messageId,
    status,
    queueName,
    payload,
    processingTimeMs,
    receivedAt: new Date(
      parseInt(record.attributes.SentTimestamp)
    ).toISOString(),
    processedAt: now,
    receiveCount: parseInt(record.attributes.ApproximateReceiveCount),
    ...(error && {
      errorMessage: error.message,
      errorStack: error.stack,
    }),
  };

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: auditItem,
    })
  );
}
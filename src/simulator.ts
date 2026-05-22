import { SQSEvent } from 'aws-lambda';
import { Bundle } from './types/sqs.types.js'; 

const mockBundle: Bundle = {
  resourceType: "Bundle",
  type: "document",
  timestamp: "2026-04-17T10:00:00Z",
  entry: [
    {
      id: "551ce625-707d-4cb6-beb0-00668a9955f4",
      resource: {
        resourceType: "Patient",
        id: "paciente-123",
      },
    },
    {
      id: "1d40cb85-a697-4f88-bb20-f673f4e86646",
      resource: {
        resourceType: "Composition",
        author: [
          {
            identifier: {
              value: "EPS001",
            },
          },
        ],
      },
    },
  ],
};

export const mockSQSEvent: SQSEvent = {
  Records: [
    {
      messageId: 'msg-001',
      receiptHandle: 'mock-receipt-1',
      body: JSON.stringify(mockBundle),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: Date.now().toString(),
        SenderId: 'local',
        ApproximateFirstReceiveTimestamp: Date.now().toString(),
      },
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:my-queue',
      awsRegion: 'us-east-1',
    },
    {
      messageId: 'msg-002',
      receiptHandle: 'mock-receipt-2',
      body: JSON.stringify({
        ...mockBundle,
        entry: [
          { id: "2d822c8e-748e-46b4-9327-091a288b81b4", resource: { resourceType: "Patient", id: "paciente-456" } },
          {
            id: "6412201b-c4e3-4223-a11a-2d0581069690",
            resource: {
              resourceType: "Composition",
              author: [{ identifier: { value: "EPS002" } }],
            },
          },
        ],
      } satisfies Bundle),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: Date.now().toString(),
        SenderId: 'local',
        ApproximateFirstReceiveTimestamp: Date.now().toString(),
      },
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:my-queue',
      awsRegion: 'us-east-1',
    },
    {
      messageId: 'msg-003',
      receiptHandle: 'mock-receipt-3',
      body: 'INVALID_JSON{{{{',
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: Date.now().toString(),
        SenderId: 'local',
        ApproximateFirstReceiveTimestamp: Date.now().toString(),
      },
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:my-queue',
      awsRegion: 'us-east-1',
    },
  ],
};
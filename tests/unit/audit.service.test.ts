import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import type { SQSRecord } from 'aws-lambda';
import type { Bundle } from '../../src/types/sqs.types.js';

process.env.AWS_REGION = 'us-east-1';

const sendMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const putCommandMock = jest.fn((input: unknown) => ({ __type: 'PutCommand', input }));

jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: sendMock })
  },
  PutCommand: putCommandMock,
}));

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

let saveAuditRecord: typeof import('../../src/service/audit.service.js').saveAuditRecord;

beforeAll(async () => {
  ({ saveAuditRecord } = await import('../../src/service/audit.service.js'));
});

const validBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'document',
  timestamp: '2026-05-21T10:00:00Z',
  entry: [
    { id: 'entry-1', resource: { resourceType: 'Patient', id: 'paciente-1' } },
  ],
};

const buildRecord = (overrides: Partial<SQSRecord> = {}): SQSRecord => ({
  messageId: 'msg-1',
  receiptHandle: 'rh-1',
  body: JSON.stringify(validBundle),
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1716288000000',
    SenderId: 'test',
    ApproximateFirstReceiveTimestamp: '1716288000000',
  },
  messageAttributes: {},
  md5OfBody: '',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:audit-queue',
  awsRegion: 'us-east-1',
  ...overrides,
});

describe('audit.service - saveAuditRecord (persistencia DynamoDB)', () => {
  beforeEach(() => {
    sendMock.mockReset();
    putCommandMock.mockClear();
    sendMock.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envía exactamente un PutCommand a DynamoDB por cada invocación', async () => {
    await saveAuditRecord({
      record: buildRecord(),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now() - 100,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(putCommandMock).toHaveBeenCalledTimes(1);

    const sentCommand = sendMock.mock.calls[0][0] as { __type: string };
    expect(sentCommand.__type).toBe('PutCommand');
  });


  it('construye el id de auditoría con el prefijo AUDIT# y el messageId', async () => {
    await saveAuditRecord({
      record: buildRecord({ messageId: 'msg-abc-123' }),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as { Item: { transferId: string; messageId: string } }).Item;
    expect(item.transferId).toBe('AUDIT#msg-abc-123');
    expect(item.messageId).toBe('msg-abc-123');
  });

  it('extrae el nombre de la cola del eventSourceARN', async () => {
    await saveAuditRecord({
      record: buildRecord({
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:bundles-queue',
      }),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as { Item: { queueName: string } }).Item;
    expect(item.queueName).toBe('bundles-queue');
  });

  it('marca queueName como "unknown" cuando split no produce segmentos (ARN ausente)', async () => {
    const recordSinArn = buildRecord();
    (recordSinArn as { eventSourceARN: unknown }).eventSourceARN = {
      split: () => [] as string[],
    };

    await saveAuditRecord({
      record: recordSinArn,
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as { Item: { queueName: string } }).Item;
    expect(item.queueName).toBe('unknown');
  });

  it('persiste status SUCCESS sin incluir campos de error', async () => {
    await saveAuditRecord({
      record: buildRecord(),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: Record<string, unknown>;
    }).Item;
    expect(item.status).toBe('SUCCESS');
    expect(item).not.toHaveProperty('errorMessage');
    expect(item).not.toHaveProperty('errorStack');
  });

  it('persiste status ERROR junto con errorMessage y errorStack', async () => {
    const fakeError = new Error('DynamoDB inalcanzable');
    fakeError.stack = 'Error: DynamoDB inalcanzable\n    at test (file.ts:1:1)';

    await saveAuditRecord({
      record: buildRecord(),
      status: 'ERROR',
      payload: validBundle,
      startTime: Date.now(),
      error: fakeError,
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: Record<string, unknown>;
    }).Item;
    expect(item.status).toBe('ERROR');
    expect(item.errorMessage).toBe('DynamoDB inalcanzable');
    expect(item.errorStack).toBe(fakeError.stack);
  });

  it('omite el payload cuando no se provee (caso de body inválido)', async () => {
    await saveAuditRecord({
      record: buildRecord(),
      status: 'ERROR',
      startTime: Date.now(),
      error: new Error('JSON parse falló'),
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: Record<string, unknown>;
    }).Item;
    expect(item.payload).toBeUndefined();
  });

  it('incluye el payload completo cuando se provee', async () => {
    await saveAuditRecord({
      record: buildRecord(),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: { payload: Bundle };
    }).Item;
    expect(item.payload).toEqual(validBundle);
  });

  it('calcula processingTimeMs como un valor no negativo', async () => {
    const startTime = Date.now() - 250;

    await saveAuditRecord({
      record: buildRecord(),
      status: 'SUCCESS',
      payload: validBundle,
      startTime,
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: { processingTimeMs: number };
    }).Item;
    expect(item.processingTimeMs).toBeGreaterThanOrEqual(250);
    expect(item.processingTimeMs).toBeLessThan(5000);
  });

  it('convierte SentTimestamp en ISO 8601 para receivedAt', async () => {
    await saveAuditRecord({
      record: buildRecord({
        attributes: {
          ApproximateReceiveCount: '3',
          SentTimestamp: '1716288000000',
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: '1716288000000',
        },
      }),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: { receivedAt: string };
    }).Item;
    expect(item.receivedAt).toBe(new Date(1716288000000).toISOString());
  });

  it('parsea ApproximateReceiveCount a entero', async () => {
    await saveAuditRecord({
      record: buildRecord({
        attributes: {
          ApproximateReceiveCount: '7',
          SentTimestamp: '1716288000000',
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: '1716288000000',
        },
      }),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: { receiveCount: number };
    }).Item;
    expect(item.receiveCount).toBe(7);
    expect(typeof item.receiveCount).toBe('number');
  });

  it('produce timestamp y processedAt iguales y en formato ISO 8601', async () => {
    await saveAuditRecord({
      record: buildRecord(),
      status: 'SUCCESS',
      payload: validBundle,
      startTime: Date.now(),
    });

    const item = (putCommandMock.mock.calls[0][0] as {
      Item: { timestamp: string; processedAt: string };
    }).Item;
    expect(item.timestamp).toBe(item.processedAt);
    expect(item.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('propaga la excepción cuando DynamoDB.send falla', async () => {
    const dbError = new Error('ProvisionedThroughputExceeded');
    sendMock.mockRejectedValueOnce(dbError);

    await expect(
      saveAuditRecord({
        record: buildRecord(),
        status: 'SUCCESS',
        payload: validBundle,
        startTime: Date.now(),
      })
    ).rejects.toThrow('ProvisionedThroughputExceeded');

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

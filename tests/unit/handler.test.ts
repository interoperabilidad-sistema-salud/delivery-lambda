import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { Bundle } from '../../src/types/sqs.types.js';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import type { AuditStatus } from '../../src/types/dynamodb.types.js';

type SaveAuditArgs = {
  record: SQSRecord;
  status: AuditStatus;
  payload?: Bundle;
  startTime: number;
  error?: Error;
};

const saveAuditRecordMock = jest.fn<(args: SaveAuditArgs) => Promise<void>>();

jest.unstable_mockModule('../../src/service/audit.service.js', () => ({
  saveAuditRecord: saveAuditRecordMock,
}));

let handler: typeof import('../../src/handler.js').handler;

beforeAll(async () => {
  ({ handler } = await import('../../src/handler.js'));
});

const validBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'document',
  timestamp: '2026-05-21T10:00:00Z',
  entry: [
    {
      id: 'entry-1',
      resource: { resourceType: 'Patient', id: 'paciente-1' },
    },
    {
      id: 'entry-2',
      resource: {
        resourceType: 'Composition',
        author: [{ identifier: { value: 'EPS001' } }],
      },
    },
  ],
};

const buildRecord = (overrides: Partial<SQSRecord> = {}): SQSRecord => ({
  messageId: 'msg-default',
  receiptHandle: 'rh-default',
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
  eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test-queue',
  awsRegion: 'us-east-1',
  ...overrides,
});

const buildEvent = (records: SQSRecord[]): SQSEvent => ({ Records: records });

describe('handler (consumo SQS)', () => {
  beforeEach(() => {
    saveAuditRecordMock.mockReset();
    saveAuditRecordMock.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devuelve batchItemFailures vacío cuando todos los records son válidos', async () => {
    const event = buildEvent([
      buildRecord({ messageId: 'msg-1' }),
      buildRecord({ messageId: 'msg-2' }),
    ]);

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('agrega el messageId a batchItemFailures cuando el body no es JSON válido', async () => {
    const event = buildEvent([
      buildRecord({ messageId: 'msg-bad', body: 'NO_ES_JSON{{{' }),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-bad' }]);
  });

  it('procesa los válidos y solo reporta los inválidos en batchItemFailures', async () => {
    const event = buildEvent([
      buildRecord({ messageId: 'ok-1' }),
      buildRecord({ messageId: 'bad-1', body: '<<<invalido>>>' }),
      buildRecord({ messageId: 'ok-2' }),
      buildRecord({ messageId: 'bad-2', body: '{ "incomplete":' }),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: 'bad-1' },
      { itemIdentifier: 'bad-2' },
    ]);
  });

  it('devuelve batchItemFailures vacío cuando el evento no tiene records', async () => {
    const result = await handler(buildEvent([]));

    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('registra el error en consola para los records inválidos', async () => {
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await handler(buildEvent([buildRecord({ messageId: 'msg-err', body: '{{{' })]));

    expect(errorSpy).toHaveBeenCalled();
    const [firstCallArg] = errorSpy.mock.calls[0];
    expect(firstCallArg).toContain('msg-err');
  });

  it('preserva el orden de los messageId fallidos según aparecen en el evento', async () => {
    const event = buildEvent([
      buildRecord({ messageId: 'a', body: '{{{' }),
      buildRecord({ messageId: 'b' }),
      buildRecord({ messageId: 'c', body: '{{{' }),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([
      'a',
      'c',
    ]);
  });
});

describe('handler -> audit.service (integración DynamoDB)', () => {
  beforeEach(() => {
    saveAuditRecordMock.mockReset();
    saveAuditRecordMock.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('invoca saveAuditRecord con status SUCCESS para cada record válido', async () => {
    await handler(buildEvent([
      buildRecord({ messageId: 'ok-1' }),
      buildRecord({ messageId: 'ok-2' }),
    ]));

    expect(saveAuditRecordMock).toHaveBeenCalledTimes(2);
    expect(saveAuditRecordMock.mock.calls[0][0].status).toBe('SUCCESS');
    expect(saveAuditRecordMock.mock.calls[1][0].status).toBe('SUCCESS');
  });

  it('pasa el bundle parseado como payload cuando el record es válido', async () => {
    await handler(buildEvent([buildRecord({ messageId: 'ok-1' })]));

    const args = saveAuditRecordMock.mock.calls[0][0];
    expect(args.payload).toEqual(validBundle);
  });

  it('invoca saveAuditRecord con status ERROR e incluye el error capturado cuando el body es inválido', async () => {
    await handler(buildEvent([buildRecord({ messageId: 'bad-1', body: '{{{' })]));

    expect(saveAuditRecordMock).toHaveBeenCalledTimes(1);
    const args = saveAuditRecordMock.mock.calls[0][0];
    expect(args.status).toBe('ERROR');
    expect(args.error).toBeInstanceOf(Error);
    expect(args.payload).toBeUndefined();
  });

  it('propaga el messageId fallido a batchItemFailures aunque saveAuditRecord de ERROR también falle', async () => {
    saveAuditRecordMock.mockRejectedValueOnce(new Error('Throughput exceeded'));

    const result = await handler(
      buildEvent([buildRecord({ messageId: 'bad-with-audit-fail', body: '{{{' })])
    );

    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: 'bad-with-audit-fail' },
    ]);
  });

  it('agrega el record a batchItemFailures cuando saveAuditRecord en SUCCESS falla', async () => {
    saveAuditRecordMock.mockRejectedValueOnce(new Error('Dynamo timeout'));
    saveAuditRecordMock.mockResolvedValueOnce(undefined);

    const result = await handler(
      buildEvent([buildRecord({ messageId: 'audit-fail-1' })])
    );

    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: 'audit-fail-1' },
    ]);
    expect(saveAuditRecordMock).toHaveBeenCalledTimes(2);
    expect(saveAuditRecordMock.mock.calls[0][0].status).toBe('SUCCESS');
    expect(saveAuditRecordMock.mock.calls[1][0].status).toBe('ERROR');
  });

  it('pasa un startTime cercano al instante actual al saveAuditRecord', async () => {
    const before = Date.now();
    await handler(buildEvent([buildRecord({ messageId: 'ok-1' })]));
    const after = Date.now();

    const args = saveAuditRecordMock.mock.calls[0][0];
    expect(args.startTime).toBeGreaterThanOrEqual(before);
    expect(args.startTime).toBeLessThanOrEqual(after);
  });
});

import { Bundle } from './types/sqs.types.js';
//import { saveAuditRecord } from './service/audit.service.js';

import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';

const sendBundleToDestinationEPS = async (Bundle: Bundle): Promise<void> => {
  await new Promise((res) => setTimeout(res, 500));

  console.log(`Historia clinica ${Bundle.entry} procesada correctamente`);
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    //const startTime = Date.now();
    let bundle: Bundle | undefined;

    try {
      bundle = JSON.parse(record.body) as Bundle;
      await sendBundleToDestinationEPS(bundle);
      /*await saveAuditRecord({
        record,
        status: 'SUCCESS',
        payload: bundle,
        startTime,
      });*/
      console.log(`Mensaje procesado: ${record.messageId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Error procesando mensaje ${record.messageId}:`, err);

      try {
        /*await saveAuditRecord({
          record,
          status: 'ERROR',
          payload: bundle,
          startTime,
          error: err,
        });*/
      } catch (auditError) {
        console.error(
          `Error guardando auditoria del mensaje ${record.messageId}:`,
          auditError
        );
      }

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

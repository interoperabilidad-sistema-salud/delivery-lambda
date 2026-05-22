import { Bundle } from "./sqs.types.js";

export type AuditStatus = 'SUCCESS' | 'ERROR';

export interface AuditRecord {
  id: string;
  timestamp: string;
  messageId: string;
  status: AuditStatus;
  queueName: string;
  payload?: Bundle;
  errorMessage?: string;
  errorStack?: string;
  processingTimeMs: number;
  receivedAt: string;
  processedAt: string;
  receiveCount: number;
}
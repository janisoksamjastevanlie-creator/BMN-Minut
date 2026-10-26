import { isTransientApiFailure, ApiResponseError } from '../utils/serverRequest';
import type { AuditLog, InventoryRequest, NotificationItem } from '../types';
import type { RequestStateChange } from './types';

export type { RequestStateChange };

export const cloneSharedState = <T,>(state: T): T => JSON.parse(JSON.stringify(state)) as T;

export const applyRequestNumberAssignments = (
  state: Record<string, unknown>,
  assignments?: Record<string, string>
): Record<string, unknown> => {
  if (!assignments || !Array.isArray(state.requests)) return state;
  const requests = (state.requests as InventoryRequest[]).map(request => {
    if (!Object.prototype.hasOwnProperty.call(assignments, request.id)) return request;
    const number = assignments[request.id];
    return typeof number === 'string' && number
      ? { ...request, nomorPermintaan: number }
      : request;
  });
  return { ...state, requests };
};

export class StateSyncError extends Error {
  constructor(
    message: string,
    readonly definitelyNotSaved = false,
    readonly status?: number,
    // true bila penyebabnya jaringan/server sementara sehingga layak dicoba ulang otomatis.
    readonly recoverable = false
  ) {
    super(message);
  }
}

export const isRecoverableFailure = (error: unknown): boolean =>
  isTransientApiFailure(error) ||
  (error instanceof ApiResponseError && error.status >= 500) ||
  (error instanceof StateSyncError && error.recoverable);

export const sameSharedState = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export type { LogAudit, PushNotification } from './types';

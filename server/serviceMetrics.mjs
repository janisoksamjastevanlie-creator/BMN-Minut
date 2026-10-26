import { logExternalServiceTiming } from '../performanceMetrics.mjs';

export async function measureExternalService(provider, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    const metrics = result && typeof result.success === 'boolean'
      ? result
      : { success: true, sentCount: 1, failedCount: 0 };
    logExternalServiceTiming(provider, startedAt, metrics);
    return result;
  } catch (error) {
    logExternalServiceTiming(provider, startedAt, null);
    throw error;
  }
}

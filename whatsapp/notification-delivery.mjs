export async function dispatchNotificationDelivery({ response, deferred, deliver, onFailure }) {
  const run = async () => {
    let result;
    try {
      result = await deliver();
    } catch {
      result = { success: false, error: 'Pengiriman notifikasi WhatsApp gagal.' };
    }
    if (!result.success) await onFailure();
    return result;
  };

  if (deferred) {
    response.status(202).json({ success: true, queued: true });
    void run().catch(() => {
      console.error('Failed to record deferred WhatsApp notification failure.');
    });
    return;
  }

  const result = await run();
  response.status(result.success ? 200 : 502).json(result);
}

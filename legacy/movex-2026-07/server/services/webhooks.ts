import { storage } from "../storage";
import { signWebhookPayload } from "../lib/crypto";

export async function dispatchWebhookEvent(companyId: string, event: string, data: Record<string, unknown>): Promise<void> {
  const subscriptions = await storage.getActiveWebhookSubscriptionsForEvent(companyId, event);
  if (subscriptions.length === 0) return;

  const payload = { event, data, timestamp: new Date().toISOString() };
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const signature = signWebhookPayload(sub.secret, body);
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-P2P-Signature": signature,
            "X-P2P-Event": event,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        await storage.recordWebhookDelivery(sub.id, event, payload, res.status, res.ok);
      } catch (error: any) {
        await storage.recordWebhookDelivery(sub.id, event, payload, undefined, false, error.message);
      }
    }),
  );
}

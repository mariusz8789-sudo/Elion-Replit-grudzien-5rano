import type { PaymentAdapter } from './contracts';

/**
 * TEST-ONLY payment adapters. Neither is wired into any UI or exported
 * from an index a screen would import — they exist solely so
 * `commercial.test.ts` can exercise the PAID path without a real payment
 * processor (which this repo does not implement in this pass).
 */

/** Always confirms — the one path that legitimately reaches PAID in tests. */
export const alwaysConfirmingAdapter: PaymentAdapter = {
  async confirmPayment(engagementId: string, amountCents: number) {
    return { confirmed: true, reference: `TEST-CONFIRMED-${engagementId}-${amountCents}` };
  },
};

/** Never confirms — proves PAID stays unreachable even WITH an adapter, if that adapter refuses. */
export const alwaysRefusingAdapter: PaymentAdapter = {
  async confirmPayment(engagementId: string) {
    return { confirmed: false, reference: `TEST-REFUSED-${engagementId}` };
  },
};

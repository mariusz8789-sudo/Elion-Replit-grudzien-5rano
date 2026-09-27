import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Company } from "@shared/schema";

// The live Stripe API is not reachable from CI (egress policy blocks api.stripe.com), and
// hitting the network wouldn't test OUR code anyway - Stripe guarantees the transfer itself.
// What IS our responsibility is the exact request we build: the destination-charge shape,
// the cents conversion, manual-capture escrow, the 10% application fee, destination routing
// and metadata linkage. We prove that contract by injecting a fake Stripe client and
// asserting precisely what createSplitPaymentIntent / getOrCreateConnectAccount send.
const h = vi.hoisted(() => {
  const paymentIntentsCreate = vi.fn();
  const accountsCreate = vi.fn();
  const accountLinksCreate = vi.fn();
  const setCompanyStripeConnectAccount = vi.fn();
  return {
    paymentIntentsCreate,
    accountsCreate,
    accountLinksCreate,
    setCompanyStripeConnectAccount,
    fakeStripe: {
      paymentIntents: { create: paymentIntentsCreate },
      accounts: { create: accountsCreate },
      accountLinks: { create: accountLinksCreate },
    },
  };
});

// Paths resolve to the same module ids that stripeConnect.ts imports (server/stripe.ts,
// server/storage.ts) - i.e. relative to THIS test file, two levels up.
vi.mock("../../stripe", () => ({
  getStripe: () => h.fakeStripe,
  isStripeConfigured: () => true,
}));

vi.mock("../../storage", () => ({
  storage: { setCompanyStripeConnectAccount: h.setCompanyStripeConnectAccount },
}));

import {
  createSplitPaymentIntent,
  getOrCreateConnectAccount,
  createOnboardingLink,
  isStripeConnectConfigured,
} from "../stripeConnect";
import { calculateCapacityClaimSplit } from "../../lib/capacityPricing";

beforeEach(() => {
  h.paymentIntentsCreate.mockReset();
  h.accountsCreate.mockReset();
  h.accountLinksCreate.mockReset();
  h.setCompanyStripeConnectAccount.mockReset();
});

describe("createSplitPaymentIntent (capacity-network destination charge)", () => {
  it("builds a manual-capture destination charge with the exact 10% split, in cents", async () => {
    h.paymentIntentsCreate.mockResolvedValue({ id: "pi_1", client_secret: "cs_1" });
    const priceEur = 480.0;
    const { platformFeeEur, payoutEur } = calculateCapacityClaimSplit(priceEur);
    expect(platformFeeEur).toBe(48.0); // 10% commission
    expect(payoutEur).toBe(432.0); // carrier payout

    await createSplitPaymentIntent({
      amountEur: priceEur,
      applicationFeeEur: platformFeeEur,
      destinationAccountId: "acct_poster",
      metadata: { capacityBookingId: "claim_1" },
    });

    expect(h.paymentIntentsCreate).toHaveBeenCalledTimes(1);
    expect(h.paymentIntentsCreate).toHaveBeenCalledWith({
      amount: 48000, // full price charged to the claiming company
      currency: "eur",
      capture_method: "manual", // escrow: a claim sitting unaccepted never moves money
      application_fee_amount: 4800, // platform keeps exactly 10%
      transfer_data: { destination: "acct_poster" }, // rest is routed to the posting company
      metadata: { capacityBookingId: "claim_1" }, // links the intent back to the claim
    });
  });

  it("rounds fractional euros to whole cents (no sub-cent drift)", async () => {
    h.paymentIntentsCreate.mockResolvedValue({ id: "pi_2", client_secret: "cs_2" });
    const priceEur = 123.45;
    const { platformFeeEur } = calculateCapacityClaimSplit(priceEur); // 12.345 -> 12.35
    expect(platformFeeEur).toBe(12.35);

    await createSplitPaymentIntent({
      amountEur: priceEur,
      applicationFeeEur: platformFeeEur,
      destinationAccountId: "acct_x",
      metadata: {},
    });

    const arg = h.paymentIntentsCreate.mock.calls[0][0];
    expect(arg.amount).toBe(12345);
    expect(arg.application_fee_amount).toBe(1235);
    // reconciliation: what the carrier receives + platform fee == full charge
    expect(arg.amount - arg.application_fee_amount).toBe(12345 - 1235);
  });
});

describe("getOrCreateConnectAccount", () => {
  it("returns the existing connected account without creating a new one", async () => {
    const company = { id: "c1", email: "c1@co.test", stripeConnectAccountId: "acct_existing" } as Company;
    const id = await getOrCreateConnectAccount(company);
    expect(id).toBe("acct_existing");
    expect(h.accountsCreate).not.toHaveBeenCalled();
    expect(h.setCompanyStripeConnectAccount).not.toHaveBeenCalled();
  });

  it("creates an Express account with transfers requested and persists it on first call", async () => {
    h.accountsCreate.mockResolvedValue({ id: "acct_new" });
    const company = { id: "c2", email: "c2@co.test", stripeConnectAccountId: null } as unknown as Company;
    const id = await getOrCreateConnectAccount(company);

    expect(h.accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        email: "c2@co.test",
        business_type: "company",
        capabilities: { transfers: { requested: true } },
      }),
    );
    expect(h.setCompanyStripeConnectAccount).toHaveBeenCalledWith("c2", "acct_new");
    expect(id).toBe("acct_new");
  });
});

describe("createOnboardingLink", () => {
  it("requests an account_onboarding link with the given return/refresh URLs", async () => {
    h.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.test/setup/x" });
    const url = await createOnboardingLink("acct_1", "https://app.test/refresh", "https://app.test/return");
    expect(url).toBe("https://connect.stripe.test/setup/x");
    expect(h.accountLinksCreate).toHaveBeenCalledWith({
      account: "acct_1",
      refresh_url: "https://app.test/refresh",
      return_url: "https://app.test/return",
      type: "account_onboarding",
    });
  });
});

describe("isStripeConnectConfigured", () => {
  it("mirrors isStripeConfigured", () => {
    expect(isStripeConnectConfigured()).toBe(true);
  });
});

import { getStripe, isStripeConfigured } from "../stripe";
import { storage } from "../storage";
import type { Company } from "@shared/schema";

// Stripe Connect (Express) payout accounts for company-to-company capacity claims in the
// Return Trip Marketplace network. Reuses the single lazily-constructed Stripe client from
// stripe.ts (Connect calls are just different methods on the same client) - no second SDK
// instance, no new env var beyond the STRIPE_SECRET_KEY that already gates every payment path.
export function isStripeConnectConfigured(): boolean {
  return isStripeConfigured();
}

// Creates the company's Express account on first call, or returns the existing one - so this
// is safe to call every time a company opens the "connect payouts" panel, not just once.
export async function getOrCreateConnectAccount(company: Company): Promise<string> {
  if (company.stripeConnectAccountId) {
    return company.stripeConnectAccountId;
  }
  const account = await getStripe().accounts.create({
    type: "express",
    email: company.email,
    business_type: "company",
    capabilities: {
      transfers: { requested: true },
    },
  });
  await storage.setCompanyStripeConnectAccount(company.id, account.id);
  return account.id;
}

export async function createOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

interface SplitPaymentIntentInput {
  amountEur: number;
  applicationFeeEur: number;
  destinationAccountId: string;
  metadata: Record<string, string>;
}

// Manual capture, same as every other escrow-style payment in this app (bookings, road service
// orders) - the charge is authorized when the claim is made and only captured once the
// publishing company accepts it, so a claim that sits unaccepted never actually moves money.
export async function createSplitPaymentIntent(input: SplitPaymentIntentInput) {
  return getStripe().paymentIntents.create({
    amount: Math.round(input.amountEur * 100),
    currency: "eur",
    capture_method: "manual",
    application_fee_amount: Math.round(input.applicationFeeEur * 100),
    transfer_data: {
      destination: input.destinationAccountId,
    },
    metadata: input.metadata,
  });
}

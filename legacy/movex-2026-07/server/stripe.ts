import Stripe from "stripe";
import { env } from "./env";

// Constructed lazily so a deployment without a Stripe account configured can still boot
// and serve every non-payment feature; every call site must check isStripeConfigured()
// first and return a clear 503 rather than calling getStripe() unconditionally.
let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe is not configured: STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-10-29.clover",
      typescript: true,
    });
  }
  return stripeClient;
}

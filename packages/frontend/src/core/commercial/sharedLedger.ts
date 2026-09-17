import { CommercialLedger } from './ledger';

/** One shared, in-memory ledger for the `/monetize` screen — not persisted; a refresh starts a fresh, honestly-empty ledger. */
export const sharedCommercialLedger = new CommercialLedger();

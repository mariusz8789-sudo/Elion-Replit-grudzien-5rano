/* Proprietary / All Rights Reserved - Genesis OS */
export interface SourcePolicy { readonly domain: string; readonly legalStatus: 'VERIFIED' | 'PENDING'; readonly officialApiOnly: boolean; readonly rateLimitPerMin: number; readonly notes: string; }
export const DEFAULT_POLICIES: readonly SourcePolicy[] = [
  { domain: 'youtube.com', legalStatus: 'PENDING', officialApiOnly: true, rateLimitPerMin: 10, notes: 'Metadata wyłącznie przez YouTube Data API z wstrzykiwanym kluczem; transkrypcje zablokowane do czasu weryfikacji prawnej.' },
  { domain: 'youtu.be', legalStatus: 'PENDING', officialApiOnly: true, rateLimitPerMin: 10, notes: 'Jak youtube.com.' },
  { domain: 'facebook.com', legalStatus: 'PENDING', officialApiOnly: true, rateLimitPerMin: 5, notes: 'Wyłącznie oficjalny Graph API; brak automatyzacji przeglądarki i obchodzenia zabezpieczeń.' },
  { domain: 'x.com', legalStatus: 'PENDING', officialApiOnly: true, rateLimitPerMin: 5, notes: 'Wyłącznie oficjalne X API v2.' },
  { domain: 'twitter.com', legalStatus: 'PENDING', officialApiOnly: true, rateLimitPerMin: 5, notes: 'Jak x.com.' },
  { domain: 't.me', legalStatus: 'PENDING', officialApiOnly: true, rateLimitPerMin: 5, notes: 'Wyłącznie oficjalny Bot API / ręczne dostarczenie eksportu.' },
  { domain: 'example.org', legalStatus: 'VERIFIED', officialApiOnly: false, rateLimitPerMin: 30, notes: 'Domena testowa/demo.' },
  { domain: 'wikimedia.org', legalStatus: 'VERIFIED', officialApiOnly: false, rateLimitPerMin: 30, notes: 'Treści publiczne; preferowane oficjalne API.' },
];
/** Rejestr polityk: bramka prawna + limit + wymóg oficjalnego API per domena. */
export class SourcePolicyRegistry {
  private map = new Map<string, SourcePolicy>();
  constructor(policies: readonly SourcePolicy[] = DEFAULT_POLICIES) { for (const p of policies) this.map.set(p.domain, p); }
  register(p: SourcePolicy): void { this.map.set(p.domain, p); }
  get(domain: string): SourcePolicy | undefined { return this.map.get(domain) ?? this.map.get(domain.replace(/^www\./, '')); }
  isLegalCleared(domain: string): boolean { const p = this.get(domain); return !!p && p.legalStatus === 'VERIFIED'; }
}

import { describe, expect, it } from 'vitest';
import { naturalReferenceFromMessage, rawReferenceFromMessage } from '../components/ScienceChat';
import { resolveNaturalFunctionalReplacement } from '../core/biotechData/naturalReplacement';

const INVESTOR_QUESTION = 'Znajdź naturalnych kandydatów dla receptora A1 i wykonaj dostępne analizy.';

describe('Investor WOW natural discovery question', () => {
  it('keeps receptor context out of the reference compound field', () => {
    expect(naturalReferenceFromMessage(INVESTOR_QUESTION)).toBeUndefined();
    expect(rawReferenceFromMessage(INVESTOR_QUESTION)).toBeUndefined();
  });

  it('resolves the bounded target-only A1 catalog without inventing a reference', () => {
    const result = resolveNaturalFunctionalReplacement({ target: 'A1' });
    expect(result.status).toBe('RESOLVED');
    expect(result.matchedReference).toBe('A1 target-only bounded catalog');
    expect(result.reports.length).toBeGreaterThanOrEqual(2);
  });

  it('still requires a known reference when one is explicitly supplied', () => {
    const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'unknown compound', target: 'A1' });
    expect(result.status).toBe('BLOCKED');
    expect(result.reports).toHaveLength(0);
  });
});

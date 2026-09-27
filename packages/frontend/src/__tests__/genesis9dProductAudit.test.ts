import { describe, expect, it } from 'vitest';
import { GENESIS_9D_PRODUCT_AUDIT } from '../core/capabilities/genesis9dProductAudit';

describe('Genesis 9D product admission audit', () => {
  it('classifies every existing module without exposing a fake 9D runtime', () => {
    expect(GENESIS_9D_PRODUCT_AUDIT).toHaveLength(7);
    expect(new Set(GENESIS_9D_PRODUCT_AUDIT.map(({ id }) => id)).size).toBe(7);
    expect(GENESIS_9D_PRODUCT_AUDIT.every(({ publicRuntime }) => publicRuntime === false)).toBe(true);
    expect(GENESIS_9D_PRODUCT_AUDIT.filter(({ decision }) => decision === 'INTEGRATE_NOW')).toEqual([]);
  });

  it('rejects the unsubstantiated ice-wall premise and keeps the internal UX helper non-scientific', () => {
    expect(GENESIS_9D_PRODUCT_AUDIT.find(({ id }) => id === 'ice-wall-beyond')?.decision).toBe('NOT_USEFUL');
    expect(GENESIS_9D_PRODUCT_AUDIT.find(({ id }) => id === 'platform-ux')?.decision).toBe('NOT_USEFUL');
  });
});

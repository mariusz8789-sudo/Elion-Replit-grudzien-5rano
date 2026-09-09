import { describe, expect, it } from 'vitest';
import { bitColor } from '../labs/experiments/quantum-teleport';

describe('bitColor — reveals the real classical bit value (0/1), never a fabricated shade', () => {
  it('maps bit 1 to the amber accent (matches CHSH source-pulse color)', () => {
    expect(bitColor(1)).toBe(0xf0b35c);
  });
  it('maps bit 0 to the dim slate accent', () => {
    expect(bitColor(0)).toBe(0x5a6a8f);
  });
});

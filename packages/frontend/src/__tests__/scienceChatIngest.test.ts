import { describe, expect, it } from 'vitest';
import { resolveCommand } from '../core/scienceChat/resolveCommand';

describe('Science Chat `/ingest` → knowledge ingestion action', () => {
  it('extracts the URLs from the raw message, in order, trailing punctuation stripped', () => {
    const r = resolveCommand('/ingest https://wikimedia.org/wiki/Test, https://youtu.be/abc123xyz.', null);
    expect(r.action?.type).toBe('ingestUrls');
    if (r.action?.type !== 'ingestUrls') throw new Error('expected ingestUrls');
    expect(r.action.urls).toEqual(['https://wikimedia.org/wiki/Test', 'https://youtu.be/abc123xyz']);
    expect(r.intent).toBe('CREATE_TASK');
    expect(r.text).toMatch(/propozycja/i);
  });
  it('with no URL it explains the rules instead of guessing a source', () => {
    const r = resolveCommand('/ingest', null);
    expect(r.action).toBeUndefined();
    expect(r.text).toMatch(/oficjalne API/);
  });
  it('the Polish phrasing routes the same way', () => {
    const r = resolveCommand('zaingestuj https://wikimedia.org/wiki/A', null);
    expect(r.action?.type).toBe('ingestUrls');
  });
  it('an ordinary question with a URL is not treated as ingestion', () => {
    const r = resolveCommand('pokaż czarną dziurę', null);
    expect(r.action?.type).not.toBe('ingestUrls');
  });
});

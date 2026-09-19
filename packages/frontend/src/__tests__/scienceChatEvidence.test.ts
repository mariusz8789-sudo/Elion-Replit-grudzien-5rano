import { describe, expect, it } from 'vitest';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { LaypersonAssistant } from '@genesis/core/knowledge/LaypersonAssistant.js';
import { generateCuriosityQuestions } from '@genesis/core/knowledge/curiosity.js';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';

describe('Science Chat `/dowody` and `/ciekawość` (D-128) — routed, never answered by the resolver itself', () => {
  it('`/dowody <pytanie>` routes to an evidenceAnswer action with the query; bare `/dowody` explains', () => {
    const r = resolveCommand('/dowody czy wieże zatrzymywały ciepło?', null);
    expect(r.action).toEqual({ type: 'evidenceAnswer', query: 'czy wieże zatrzymywały ciepło' });
    expect(r.intent).toBe('VERIFY'); expect(r.tag).toBe('SYSTEM'); expect(r.text).toContain('Nie wiem');
    expect(resolveCommand('co wiemy o stałej sieci NaCl', null).action).toEqual({ type: 'evidenceAnswer', query: 'stałej sieci NaCl' });
    expect(resolveCommand('/dowody', null)).toMatchObject({ intent: 'HELP' });
    expect(resolveCommand('pokaż czarną dziurę', null).action?.type).not.toBe('evidenceAnswer');
  });
  it('`/ciekawość` routes to a curiosity action with a bounded limit', () => {
    expect(resolveCommand('/ciekawość', null).action).toEqual({ type: 'curiosity', limit: 6 });
    expect(resolveCommand('/ciekawosc 12', null).action).toEqual({ type: 'curiosity', limit: 12 });
    expect(resolveCommand('/ciekawość 99', null).action).toEqual({ type: 'curiosity', limit: 20 });
    expect(resolveCommand('jakie pytania warto zadać?', null).action?.type).toBe('curiosity');
  });
  it('the executed answer is the ledger\'s: "Nie wiem" on an empty ledger, a status-labelled claim with sources otherwise; curiosity on an empty ledger is empty', () => {
    const empty = new EvidenceLedger({ now: () => 1 });
    expect(new LaypersonAssistant(empty).answer('cokolwiek').saidIdontKnow).toBe(true);
    expect(generateCuriosityQuestions(empty.getActive()).questions).toEqual([]);
    empty.addRecord({ sourceUrl: 'https://wikimedia.org/x', sourceTimestamp: null, claim: 'wieże zatrzymywały ciepło w nocy', claimType: 'reported_claim', confidence: 0.6, provenance: { sourceKind: 'document', retrievedBy: 't', independentSourceIds: [] } });
    const a = new LaypersonAssistant(empty).answer('czy wieże zatrzymywały ciepło');
    expect(a.saidIdontKnow).toBe(false); expect(a.sources.length).toBe(1); expect(a.answer).toContain('Status:');
    expect(generateCuriosityQuestions(empty.getActive()).questions[0].kind).toBe('INDEPENDENT_CONFIRMATION');
  });
});

import { fnv1a } from '../events/hash';
import { BIOLOGY_CATALOG } from './biologyLabWorld';
import { parseWorldCommands, type ParsedCommands, type WorldCommand } from './worldCommand';

/**
 * SCIENTIFIC WORLDS — BIOLOGY COMMAND BRIDGE.
 *
 * D-136: biology's own classification (the V3 pack's router, the Human Explorer zoom ladder, and the
 * organs/display-modes/section-plane phrasing this world adds on top) now lives entirely behind
 * `BIOLOGY_CATALOG.resolvers` (`biologyCommandResolver.ts`), reached through the ONE canonical
 * `parseWorldCommands` — there is no second parser entry point here. This bridge keeps only what is
 * genuinely biology-specific and NOT the canonical parser's job: splitting a sentence into clauses on
 * biology's own separators (bare commas included — "Otwórz X, pokaż Y, przejdź do Z" — which the
 * canonical parser's own clause split does not do, since other worlds' sentences do use commas
 * for e.g. compositions/numbers) before handing each clause to the canonical parser in turn.
 * Deterministic: same text + logical time -> same ids.
 */

const CLAUSES = /(?:[.;!?,]\s*|\s+(?:a potem|potem|nastepnie|a nastepnie|then|and then)\s+|\s+(?:i|and)\s+(?=(?:pokaz|pokaż|show)))/i;

const LEADING_CONNECTOR = /^(?:a potem|a nastepnie|a następnie|potem|nastepnie|następnie|and then|then|and|i|a)(?:\s+|$)/i;

export function parseBiologyWorldCommands(text: string, logicalTime: number): ParsedCommands {
  const raw = text.trim();
  if (!raw) return { commands: [], unresolved: [] };
  const clauses = raw.split(CLAUSES).map((c) => c.trim().replace(LEADING_CONNECTOR, '')).filter((c) => c.length > 0);
  const commands: WorldCommand[] = [];
  const unresolved: string[] = [];
  clauses.forEach((clause, index) => {
    const parsed = parseWorldCommands(clause, BIOLOGY_CATALOG, logicalTime);
    if (!parsed.commands.length) { unresolved.push(clause); return; }
    parsed.commands.forEach((c, sub) => commands.push({ ...c, commandId: `cmd-${fnv1a(`${raw}|${logicalTime}|${index}|${sub}|bio`)}` }));
  });
  return { commands, unresolved };
}

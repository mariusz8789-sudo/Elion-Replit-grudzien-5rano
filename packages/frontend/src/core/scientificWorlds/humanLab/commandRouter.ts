import type { BiologyLabCommand, MagnificationLevel } from './types';
import { stableHash } from './hash';

function numberParam(text: string, regex: RegExp, fallback: number): number {
  const match = text.match(regex);
  return match ? Number(match[1]) : fallback;
}

export function parseBiologyLabCommand(sourceText: string, requestedAtLogicalTime: number): BiologyLabCommand | null {
  const text = sourceText.trim().toLowerCase();
  if (!text) return null;
  const commandId = `BIOCMD-${stableHash({ text, requestedAtLogicalTime })}`;
  if (/(wirtualnego człowieka|digital twin|human digital twin|człowieka)/.test(text) && /(otwórz|pokaż|otworz|show|open)/.test(text)) return { commandId, kind: 'OPEN_TWIN', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(mózg|brain|hipokamp|hippocampus)/.test(text)) return { commandId, kind: 'FOCUS_ANATOMY', targetId: text.includes('hipokamp') || text.includes('hippocampus') ? 'hippocampus.left' : 'brain', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(rtg|x-ray|xray)/.test(text)) return { commandId, kind: 'SET_ANATOMY_MODE', sourceText, requestedAtLogicalTime, parameters: { mode: 'XRAY' } };
  if (/(hyperscope|mikroskop|microscope)/.test(text) && /(otwórz|pokaż|open|show)/.test(text)) return { commandId, kind: 'OPEN_HYPERSCOPE', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(powiększ|powieksz|zoom|magnification)/.test(text)) {
    const value = numberParam(text, /(\d+)\s*x/, 5);
    const magnification = ([1, 5, 25, 100, 500, 1000] as const).find((v) => v === value) ?? 5;
    return { commandId, kind: 'CAPTURE_HYPERSCOPE', sourceText, requestedAtLogicalTime, parameters: { magnification: magnification as MagnificationLevel } };
  }
  if (/(orpheus|analizator|zbadaj próbkę|zbadaj probke|scan sample)/.test(text)) return { commandId, kind: 'RUN_ORPHEUS', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(obrazowanie|tomografia|mri|ultrasound|usg)/.test(text)) return { commandId, kind: 'OPEN_IMAGING', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(slajd|preparat histologiczny|histology)/.test(text)) return { commandId, kind: 'CREATE_SLIDE', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(komórka|komorka|cell)/.test(text)) return { commandId, kind: 'INSPECT_CELL', sourceText, requestedAtLogicalTime, parameters: {} };
  if (/(pokaż dowody|pokaz dowody|evidence|provenance)/.test(text)) return { commandId, kind: 'SHOW_EVIDENCE', sourceText, requestedAtLogicalTime, parameters: {} };
  return null;
}

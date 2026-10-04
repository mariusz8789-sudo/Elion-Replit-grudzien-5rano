import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../labs/index';
import { ENGINE_NAME_PATTERN, TECHNICAL_DETAILS_ATTR } from '../core/capabilityNames';
import { ASK_ITEM, MORE_OVERVIEW_ITEM, MORE_SECTIONS, NAV_ITEMS, NAV_SECTIONS } from '../core/navigation';
import { navDescription, navGroupLabel, navLabel, navShortLabel, shellText } from '../core/navigationText';
import { buildCapabilityIndex, buildDestinationIndex, buildGoalIndex, buildSearchIndex } from '../core/search';
import { LABEL_MEANING, SCIENTIFIC_OS, SHOWCASE } from '../core/scientificOs/catalogue';
import { CHAT_ENGINES, chatEngineLine } from '../core/scienceChat/engines';
import type { Locale } from '../core/i18n';

/**
 * CUSTOMER TEXT NAMES CAPABILITIES, NEVER ENGINES (owner brief, 3 Oct 2026).
 *
 * Navigation, Search, Start, the More catalogue and the Ask chips say what
 * Genesis does ("Molecular Dynamics"), not which engine does it (OpenMM). The
 * exact engine identity belongs to Evidence, provenance, Replay, the Reviewer
 * Room and sections marked `data-technical-details`; this sweep removes those
 * sections and fails on any engine name left in what a customer reads —
 * visible text, tooltips, accessible names and placeholders.
 */

const LOCALES: readonly Locale[] = ['pl', 'en', 'ar'];

function offenders(texts: readonly (string | undefined)[]): string[] {
  return texts.filter((t): t is string => typeof t === 'string' && ENGINE_NAME_PATTERN.test(t));
}

/** Drop every `data-technical-details` section, then keep what a person can read or hear. */
function customerText(html: string): string {
  const open = new RegExp(`<(details|section|div)\\b[^>]*\\b${TECHNICAL_DETAILS_ATTR}\\b[^>]*>`, 'g');
  let out = html;
  for (let match = open.exec(out); match !== null; match = open.exec(out)) {
    const tag = match[1]!;
    const end = out.indexOf(`</${tag}>`, match.index);
    out = out.slice(0, match.index) + out.slice(end + tag.length + 3);
    open.lastIndex = match.index;
  }
  const attributes = [...out.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  return `${out.replace(/<[^>]*>/g, ' ')} ${attributes.join(' ')}`;
}

function stubWindow(): void {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 },
    location: { hash: '' },
    addEventListener: () => {}, removeEventListener: () => {},
  });
}

describe('the guard itself', () => {
  it('catches engine names and leaves capability words alone', () => {
    for (const s of ['RDKit 3D', 'AutoDock Vina', 'GNINA rescoring', 'run PySCF', 'OpenMM', 'ADMET-AI', 'Meeko prep']) expect(ENGINE_NAME_PATTERN.test(s), s).toBe(true);
    for (const s of ['Molecular Dynamics', 'Quantum Chemistry', 'Property & Safety Analysis (ADMET)', 'Wina', 'Interaction Modeling']) expect(ENGINE_NAME_PATTERN.test(s), s).toBe(false);
    const html = `<p>Docking baseline</p><details ${TECHNICAL_DETAILS_ATTR}><summary>Technical details</summary><li>AutoDock Vina</li></details><span title="Molecular Analysis">x</span>`;
    expect(customerText(html)).not.toMatch(ENGINE_NAME_PATTERN);
    expect(customerText(html.replace(TECHNICAL_DETAILS_ATTR, 'data-other'))).toMatch(ENGINE_NAME_PATTERN);
  });
});

describe('navigation never names an engine', () => {
  it('labels, short labels, descriptions, group names and shell words in PL, EN and AR', () => {
    const items = [...NAV_ITEMS, ASK_ITEM, MORE_OVERVIEW_ITEM];
    const texts = LOCALES.flatMap((locale) => [
      ...items.flatMap((item) => [navLabel(item, locale), navShortLabel(item, locale), navDescription(item, locale), item.plannedNote]),
      ...[...NAV_SECTIONS, ...MORE_SECTIONS].map((section) => navGroupLabel(section, locale)),
    ]);
    const shellKeys = ['more', 'moreAll', 'allAreas', 'search', 'searchHint', 'explorer', 'moreModules', 'demoNote', 'serverStatus'] as const;
    for (const locale of LOCALES) for (const key of shellKeys) texts.push(shellText(key, locale));
    expect(offenders(texts)).toEqual([]);
  });

  it('the rendered shell (sidebar and tab bar) in Polish and English', async () => {
    const { setLocale } = await import('../core/i18n');
    const { AppShell } = await import('../components/AppShell');
    try {
      for (const locale of ['pl', 'en'] as const) {
        setLocale(locale);
        const text = customerText(renderToStaticMarkup(<AppShell>x</AppShell>));
        expect(text.match(ENGINE_NAME_PATTERN), locale).toBeNull();
      }
    } finally {
      setLocale('pl');
    }
  });
});

describe('Search shows capabilities; engine names only match, never show', () => {
  it('goals, destinations, capabilities and labs', () => {
    const shown = [...buildGoalIndex(), ...buildDestinationIndex('pl'), ...buildDestinationIndex('en'), ...buildCapabilityIndex(), ...buildSearchIndex()]
      .flatMap((e) => [e.labName, e.expName, e.tagline, e.ask]);
    expect(offenders(shown)).toEqual([]);
    // Typing an engine still finds its capability.
    expect(buildCapabilityIndex().some((e) => e.keywords.includes('openmm'))).toBe(true);
  });
});

describe('the More catalogue and the Ask chips', () => {
  it('catalogue names, lines, notes, Ask commands and legends', () => {
    const rows = [...SCIENTIFIC_OS.flatMap((g) => g.items), ...SHOWCASE];
    const texts = [
      ...SCIENTIFIC_OS.flatMap((g) => [g.name, g.line, ...(g.subgroups ?? []).map((s) => s.label)]),
      ...rows.flatMap((c) => [c.name, c.what, c.note, c.ask]),
      ...Object.values(LABEL_MEANING),
    ];
    expect(offenders(texts)).toEqual([]);
    // The engine identity is kept, in the technical field.
    expect(rows.find((c) => c.id === 'openmm')?.engine).toBe('OpenMM');
  });

  it('the rendered catalogue screen shows engines only under Technical details', async () => {
    stubWindow();
    try {
      const { ScientificOsScreen } = await import('../components/ScientificOsScreen');
      const html = renderToStaticMarkup(<ScientificOsScreen />);
      expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
      expect(html).toContain('<span>Engine</span>OpenMM');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Ask chips name the task and capability, and fill a command without an engine name', () => {
    expect(offenders(CHAT_ENGINES.flatMap((e) => [e.task, chatEngineLine(e), e.prompt]))).toEqual([]);
  });
});

describe('Start (the dashboard)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  for (const locale of ['pl', 'en'] as const) {
    it(`shows capabilities in ${locale.toUpperCase()}; engines only under Technical details`, async () => {
      stubWindow();
      const { setLocale } = await import('../core/i18n');
      setLocale(locale);
      const { StartHero } = await import('../components/StartHero');
      const html = renderToStaticMarkup(<StartHero />);
      expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
      // Not deleted: the engines and the owner's Astex wording are one click away.
      expect(html).toMatch(/data-technical-details[\s\S]*AutoDock Vina/);
      expect(html).toMatch(/data-technical-details[\s\S]*GNINA/);
      setLocale('pl');
    });
  }
});

describe('specialist screens name capabilities; engines only under Technical details', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const toolchain = () => [
    { toolId: 'rdkit', engineName: 'RDKit', domain: 'chemistry', license: 'BSD', status: 'BLOCKED_BY_RUNTIME' as const, version: null, engine: null, modelDomain: '', assumptions: '', validation: null, reason: 'worker down' },
    { toolId: 'vina', engineName: 'AutoDock Vina', domain: 'docking', license: 'Apache-2.0', status: 'AVAILABLE' as const, version: '1.2.7', engine: null, modelDomain: '', assumptions: '', validation: [{ id: 'redock', pass: true }] },
  ];

  for (const locale of ['pl', 'en'] as const) {
    it(`Advanced campaign: lede, compute readiness and the blocked banner in ${locale.toUpperCase()}`, async () => {
      stubWindow();
      const { setLocale } = await import('../core/i18n');
      setLocale(locale);
      try {
        const { CampaignScreen, ComputeReadiness, pipelineText } = await import('../components/CampaignScreen');
        const locked = renderToStaticMarkup(<CampaignScreen />);
        expect(customerText(locked).match(ENGINE_NAME_PATTERN)).toBeNull();
        expect(locked.replace(/&amp;/g, '&')).toContain(pipelineText());
        const readiness = renderToStaticMarkup(<ComputeReadiness toolchain={toolchain()} />);
        expect(customerText(readiness).match(ENGINE_NAME_PATTERN)).toBeNull();
        expect(readiness).toContain(locale === 'pl' ? 'Modelowanie oddziaływań' : 'Interaction Modeling');
        expect(readiness).toContain('data-testid="campaign-molecular-blocked"');
        // The registry is kept, one click away.
        expect(readiness).toMatch(/data-technical-details[\s\S]*AutoDock Vina/);
        expect(readiness).toMatch(/data-technical-details[\s\S]*pip install rdkit/);
      } finally {
        setLocale('pl');
      }
    });
  }

  it('Virtual Lab: capability options and result row; engines under Technical details', async () => {
    const { VirtualLabPanel, virtualLabCapabilityLabel } = await import('../components/VirtualLabPanel');
    const html = renderToStaticMarkup(<VirtualLabPanel projectId="p" campaignId="c" candidates={[]} />);
    expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
    expect(html).toMatch(/data-technical-details[\s\S]*PySCF/);
    for (const id of ['molecular-descriptors', 'admet-estimation', 'toxicity-risk-estimation', 'molecular-docking', 'quantum-chemistry', 'molecular-dynamics', 'protein-structure-ingestion'] as const) {
      expect(offenders([virtualLabCapabilityLabel(id)]), id).toEqual([]);
    }
  });

  it('Laboratory drug bench readout', async () => {
    const { projectDrugRun } = await import('../core/liveExperiment/drugRunState');
    const { benchLayoutOf, focusCandidate } = await import('../core/liveExperiment/drugBenchLayout');
    const { DrugBenchNote, DrugBenchReadout, DOCKING_SHORT, DOCKING_STEP_LABEL } = await import('../components/DrugBenchReadout');
    const candidate = { id: 'c1', generation: 1, parentSmiles: null, transformation: null, canonicalSmiles: 'CCO', valid: true, descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: true, status: 'retained', rejectedReason: null, runIds: [] };
    const events = [
      { seq: 1, id: 'e1', generation: 1, type: 'STAGE_RESULT', payload: { stage: 'docking', candidateId: 'c1', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -7.5, runId: 'r-dock', poseSha256: 'e'.repeat(64) }, createdAt: 1 },
    ];
    const dockingRuns = [{ id: 'r-dock', outputs: { poseSha256: 'e'.repeat(64), pose: { atoms: [['C', 1, 2, 3]], bonds: [] }, pocket: { residues: ['THR315:A'], atoms: [] } }, provenance: { engine: 'AutoDock Vina 1.2.7' } }];
    const state = projectDrugRun({ events, candidates: [candidate], maxGenerations: 1, jobRunning: false, dockingRuns });
    const focus = focusCandidate(state);
    const html = renderToStaticMarkup(<><DrugBenchReadout state={state} focus={focus} layout={benchLayoutOf(state)} /><DrugBenchNote focus={focus} /></>);
    expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
    expect(html).toContain('<dt>Modelowanie oddziaływań</dt>');
    expect(html).toContain('<dt>Chemia kwantowa</dt>');
    expect(html).toMatch(/data-technical-details[\s\S]*AutoDock Vina 1\.2\.7/);
    expect(offenders([DOCKING_SHORT, ...Object.values(DOCKING_STEP_LABEL)])).toEqual([]);
  });

  it('the chat names the capability in a natural-discovery answer and keeps the engine for Technical details', async () => {
    const { formatNaturalDiscoveryResult, naturalDiscoveryTechnical } = await import('../components/ScienceChat');
    type Result = Parameters<typeof formatNaturalDiscoveryResult>[0];
    const result = {
      status: 'RESOLVED', reason: 'ok', reports: [], candidateWhy: [], cheapCompute: [], heavyCompute: [],
      admetCompute: [{ pubchemCid: 2519, status: 'EXECUTED', resultOrigin: 'MODEL_ESTIMATE', summary: 'hERG 0.12', runId: 'r-admet' }],
    } as unknown as Result;
    const text = formatNaturalDiscoveryResult(result);
    expect(text.match(ENGINE_NAME_PATTERN)).toBeNull();
    expect(text).toContain('(MODEL_ESTIMATE):');
    expect(naturalDiscoveryTechnical(result).map((r) => r.value).join(' ')).toContain('ADMET-AI');
  });
});

describe('DELIVER screens: Lab handoff and Reports name capabilities; engines only under Technical details', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const executed = {
    experimentId: 'x1',
    frozen: { hypothesisId: 'h1', claim: 'Aspirin is moderately lipophilic.', engineId: 'rdkit', input: { smiles: 'CCO' }, inputHash: 'i', protocolId: 'p', predictionFingerprint: 'a', preregistrationFingerprint: 'b', criteria: [] },
    execution: { status: 'EXECUTED', engine: { engineId: 'rdkit', engineLabel: 'RDKit', version: '2026.03' }, output: { crippenLogP: 1.31 }, inputHash: 'i', outputHash: 'o', scienceRunId: 's', startedAt: '', finishedAt: '' },
    falsification: { verdict: 'SUPPORTED_WITHIN_PROTOCOL' as const, scope: '', criteria: [] },
    evidence: { evidenceProposalId: 'ev', status: 'PROPOSED' as const, publication: 'REQUIRES_HUMAN_APPROVAL' as const },
    next: { replay: { verdict: 'MATCH' as const }, proposal: { action: 'HUMAN_REVIEW' as const, reason: '' }, decidedBy: '' },
  };

  for (const locale of ['pl', 'en'] as const) {
    it(`Lab handoff and Reports in ${locale.toUpperCase()}`, async () => {
      stubWindow();
      const { experimentRows } = await import('../components/labHandoff/labHandoffModel');
      const { ExperimentsStep, HonestNotice } = await import('../components/labHandoff/LabHandoffView');
      const { deliverablesOf } = await import('../components/reports/reportsModel');
      const { ReportsList, ReportsUnsigned } = await import('../components/reports/ReportsView');
      const { LabHandoffScreen } = await import('../components/LabHandoffScreen');
      const { ReportsScreen } = await import('../components/ReportsScreen');
      const run = { researchRunId: 'rr', question: 'Q', plan: null, experiments: [executed], nextStep: 'NONE' as const, researchState: { chain: { ok: true }, events: [] } };
      const html = renderToStaticMarkup(
        <>
          <LabHandoffScreen />
          <ReportsScreen />
          <HonestNotice locale={locale} />
          <ExperimentsStep locale={locale} rows={experimentRows([executed], [], locale)} onPrepare={() => {}} />
          <ReportsUnsigned locale={locale} />
          <ReportsList locale={locale} runs={[{ researchRunId: 'rr', question: 'Q', status: 'RUNNING', nextStep: 'NONE', events: 1, createdAt: 0 }]} byRun={{ rr: { status: 'ready', items: deliverablesOf('p', run, null) } }} items={{}} onAct={() => {}} />
        </>,
      );
      expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
      expect(html).toMatch(/data-technical-details[\s\S]*rdkit/);
    });
  }
});

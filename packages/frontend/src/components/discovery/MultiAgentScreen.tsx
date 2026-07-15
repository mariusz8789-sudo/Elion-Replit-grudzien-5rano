/**
 * MultiAgentScreen (V5) — the 10-expert panel from /api/science. The roster is
 * real (GET agent-roles); the assessments are the REAL rule-based readings that
 * runAgentPanel() derives from a campaign dossier (POST multi-agent). Deep LLM
 * reasoning is honestly CAPABILITY_BLOCKED (no live model configured).
 *
 * The dossier below is a clearly-labelled REPRESENTATIVE campaign input so the
 * panel renders live analysis without requiring a full campaign run; swap it for
 * a real campaign dossier and the same endpoint drives the same UI unchanged.
 */
import { useEffect, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { Icon } from '../Icon';
import { fetchAgentRoles, runMultiAgentPanel, type AgentPanel } from '../../core/backend/client';

/** Representative campaign dossier (illustrative input — analysis is real). */
const SAMPLE_DOSSIER = {
  primaryTarget: 'DDR1',
  campaign: { status: 'COMPLETED' },
  benchmark: { candidatesGenerated: 120, candidatesSurviving: 8, dockedCount: 3, blockedEngines: ['MD', 'MM-GBSA'], rankingTop10: [{ smiles: 'CC(=O)Oc1ccccc1C(=O)O' }] },
  summaries: {
    docking: { status: 'EXECUTED', bestAffinityKcalMol: -8.2, bindingSiteMethod: 'REFERENCE_LIGAND', epistemicStatus: 'MODEL_ESTIMATE' },
    molecularDynamics: { status: 'BLOCKED_BY_RUNTIME' },
    offTarget: { riskDistribution: { HIGH: 1, MEDIUM: 2, LOW: 14 }, panelSize: 17 },
    admet: { epistemicStatus: 'MODEL_INFERRED' },
  },
  truthEngineGate: { decision: 'GO_COMPUTATIONAL' },
  knowledgeGraph: { stats: { nodes: 9, edges: 12, allEdgesHaveProvenance: true } },
  candidates: [{ structuralAlerts: [] }],
};

const ROLE_LABELS: Record<string, string> = {
  MedicinalChemist: 'Chemik medyczny', ComputationalChemist: 'Chemik obliczeniowy', StructuralBiologist: 'Biolog strukturalny',
  Toxicologist: 'Toksykolog', PKPDScientist: 'Naukowiec PK/PD', Bioinformatician: 'Bioinformatyk',
  ClinicalStrategist: 'Strateg kliniczny', RegulatoryExpert: 'Ekspert regulacyjny', GrantWriter: 'Autor grantów', ProjectManager: 'Kierownik projektu',
};

export function MultiAgentScreen() {
  const [roles, setRoles] = useState<string[]>([]);
  const [panel, setPanel] = useState<AgentPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchAgentRoles(), runMultiAgentPanel(SAMPLE_DOSSIER)]).then(([r, p]) => {
      if (!live) return;
      if (r.ok) setRoles(r.data.roles);
      if (p.ok) { setPanel(p.data); setActive(p.data.agents[0]?.role ?? null); }
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const activeAgent = panel?.agents.find((a) => a.role === active) ?? null;

  return (
    <DiscoveryShell active="#/multi-agent" title="Multi-Agent Scientific AI" subtitle="10 agentów-ekspertów analizuje realne dane kampanii"
      actions={<StatusPill kind="blocked">Reasoning: {panel?.reasoningLayer ?? '—'}</StatusPill>}>
      <div className="ds-callout ds-mt"><Icon name="alert" size={15} /> Dossier poniżej to <strong>reprezentatywne wejście kampanii</strong> (ilustracyjne). Oceny agentów są <strong>realne</strong> — deterministyczne reguły na tych danych.</div>

      {loading ? <div className="skeleton ds-mt" style={{ height: 320 }} /> : (
        <div className="ds-grid ds-agent-layout ds-mt">
          <Panel title={`Zespół (${roles.length} agentów)`} icon="users">
            <ul className="ds-agent-list">
              {panel?.agents.map((a) => (
                <li key={a.role}>
                  <button className={`ds-agent-row${active === a.role ? ' active' : ''}`} onClick={() => setActive(a.role)}>
                    <span className="ds-agent-avatar"><Icon name="brain" size={15} /></span>
                    <span className="ds-agent-name">{ROLE_LABELS[a.role] ?? a.role}</span>
                    {a.concerns.length > 0 ? <span className="ds-agent-flag" title="zgłasza obawy"><Icon name="alert" size={13} /></span> : <span className="ds-agent-ok"><Icon name="check" size={13} /></span>}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <div>
            {activeAgent ? (
              <Panel title={ROLE_LABELS[activeAgent.role] ?? activeAgent.role} icon="brain" right={<StatusPill kind="blocked">{activeAgent.reasoningStatus}</StatusPill>}>
                <h5 className="ds-sub-h">Ocena</h5><p className="ds-para">{activeAgent.assessment}</p>
                <h5 className="ds-sub-h">Rekomendacja</h5><p className="ds-para">{activeAgent.recommendation}</p>
                {activeAgent.concerns.length > 0 ? <><h5 className="ds-sub-h">Obawy</h5><ul className="ds-ul">{activeAgent.concerns.map((c, i) => <li key={i}>{c}</li>)}</ul></> : null}
                {activeAgent.reasoningNote ? <p className="ds-note ds-mt">{activeAgent.reasoningNote}</p> : null}
              </Panel>
            ) : null}

            {panel?.consensus ? (
              <Panel title="Konsensus panelu" icon="users" className="ds-mt" right={<StatusPill kind={panel.consensus.proceed ? 'ok' : 'warn'}>{panel.consensus.verdict}</StatusPill>}>
                <p className="ds-para">{panel.consensus.nextAction}</p>
                {panel.consensus.openConcerns.length > 0 ? (
                  <><h5 className="ds-sub-h">Otwarte obawy zespołu</h5>
                  <div className="ds-tags">{panel.consensus.openConcerns.map((c, i) => <span key={i} className="ds-tag">{c}</span>)}</div></>
                ) : null}
                <p className="ds-note ds-mt">{panel.honesty}</p>
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </DiscoveryShell>
  );
}

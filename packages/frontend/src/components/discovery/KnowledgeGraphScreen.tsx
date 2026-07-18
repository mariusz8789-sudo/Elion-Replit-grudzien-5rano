/**
 * KnowledgeGraphScreen (V5) — renders the REAL knowledge-graph ontology from
 * /api/science/capabilities (node types + edge/relation types) as an interactive
 * node-link graph. This is the schema every campaign graph instantiates; a live
 * campaign's instance graph plugs into the same <KnowledgeGraph> component.
 */
import { useEffect, useMemo, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { KnowledgeGraph } from '../graph/KnowledgeGraph';
import type { GNode, GEdge } from '../graph/graphLayout';
import { fetchScienceCapabilities, type ScienceCapabilities } from '../../core/backend/client';
import { useI18n } from '../../core/i18n';

/** Representative relations wiring the real node types into a legible ontology. */
const ONTOLOGY_EDGES: [string, string, string][] = [
  ['Gene', 'Protein', 'ENCODES'],
  ['Protein', 'Target', 'IS'],
  ['Compound', 'Target', 'TARGETS'],
  ['Ligand', 'Target', 'HAS_BIOACTIVITY'],
  ['Disease', 'Target', 'ASSOCIATED_WITH'],
  ['Target', 'Pathway', 'PARTICIPATES_IN'],
  ['Compound', 'Protein', 'OFF_TARGET'],
  ['Publication', 'Evidence', 'CITES'],
  ['Evidence', 'Target', 'SUPPORTED_BY'],
  ['Compound', 'Structure', 'HAS_STRUCTURE'],
  ['Target', 'Trial', 'TREATS'],
];

export function KnowledgeGraphScreen() {
  const { t } = useI18n();
  const [caps, setCaps] = useState<ScienceCapabilities | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchScienceCapabilities().then((r) => r.ok ? setCaps(r.data) : setErr(r.message)); }, []);

  const { nodes, edges } = useMemo(() => {
    const types = caps?.knowledgeGraph.nodeTypes ?? [];
    const present = new Set(types);
    const nodes: GNode[] = types.map((t) => ({ id: t, type: t, label: t }));
    const edges: GEdge[] = ONTOLOGY_EDGES
      .filter(([a, b]) => present.has(a) && present.has(b))
      .map(([source, target, label]) => ({ source, target, label }));
    return { nodes, edges };
  }, [caps]);

  return (
    <DiscoveryShell active="#/knowledge-graph" title="Knowledge Graph" subtitle={t('kg.subtitle')}
      actions={caps ? <StatusPill kind={caps.knowledgeGraph.provenanceRequired ? 'ok' : 'warn'}>provenance {caps.knowledgeGraph.provenanceRequired ? 'required' : 'optional'}</StatusPill> : null}>
      {err ? <div className="ds-empty"><h4>{t('mv.backendDown')}</h4><p>{err}</p></div> : null}
      {!caps && !err ? <div className="skeleton" style={{ height: 440 }} /> : null}
      {caps ? (
        <>
          <div className="ds-grid ds-grid-4">
            <StatBox label={t('kg.stat.nodeTypes')} value={caps.knowledgeGraph.nodeTypes.length} />
            <StatBox label={t('kg.stat.edgeTypes')} value={caps.knowledgeGraph.edgeTypes.length} />
            <StatBox label={t('kg.stat.ontologyEdges')} value={edges.length} />
            <StatBox label={t('kg.stat.provenance')} value={caps.knowledgeGraph.provenanceRequired ? t('kg.prov.required') : t('kg.prov.optional')} />
          </div>
          <Panel title={t('kg.panel.graph')} icon="graph" className="ds-mt">
            <KnowledgeGraph nodes={nodes} edges={edges} width={760} height={460} />
          </Panel>
          <Panel title={t('kg.panel.relations')} icon="graph" className="ds-mt">
            <div className="ds-tags">{caps.knowledgeGraph.edgeTypes.map((e) => <span key={e} className="ds-tag">{e}</span>)}</div>
            <p className="ds-note ds-mt">{caps.honesty}</p>
          </Panel>
        </>
      ) : null}
    </DiscoveryShell>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return <div className="ds-stat"><span className="ds-stat-label">{label}</span><span className="ds-stat-value" style={{ color: 'var(--cyan)' }}>{value}</span></div>;
}

import type { ChemistryArtifact } from '../core/scientificWorlds/chemistryRunners';

/**
 * SCIENTIFIC WORLDS — CHEMISTRY SESSION VISUAL (D-138).
 *
 * A small, dependency-free rendering of the docking/pharmacokinetics artifact
 * ALREADY sealed inside a real `ExperimentSession` (`ScientificWorldsScreen.tsx`
 * passes the same artifact object `sim.setArtifact`/`session.outputs` already
 * carry — this component never re-runs `dockLigand`/`computePharmacokinetics`,
 * it only draws numbers that already exist). It reuses the existing
 * `sw-*`/`cw-*` design-system tokens (`styles-2040-hud.css`) rather than
 * introducing a second visual language, and it is plain SVG/CSS — not a
 * second Three.js renderer.
 *
 * Every experiment other than docking/pharmacokinetics already renders
 * through the generic `Object.entries(session.outputs)` text list in the
 * evidence panel; this component is additive for exactly the two kinds that
 * benefit from a real chart (fit terms, a concentration-time curve) and
 * returns `null` for every other artifact kind, leaving that generic text
 * list as the single source of truth for everything else.
 */

export interface ChemistrySessionVisualProps {
  readonly artifact: ChemistryArtifact | null;
}

function FitBar({ label, value, testId }: { readonly label: string; readonly value: number; readonly testId: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="sw-chem-fitbar" data-testid={testId}>
      <span className="sw-chem-fitbar-label">{label}</span>
      <span className="sw-chem-fitbar-track"><span className="sw-chem-fitbar-fill" style={{ width: `${pct}%` }} /></span>
      <span className="sw-chem-fitbar-value">{pct}%</span>
    </div>
  );
}

const CHART_W = 220;
const CHART_H = 64;

export default function ChemistrySessionVisual({ artifact }: ChemistrySessionVisualProps) {
  if (!artifact) return null;

  if (artifact.kind === 'chemistry-docking') {
    const { result } = artifact;
    return (
      <div className="sw-chem-visual" data-testid="sw-chem-docking-visual">
        <div className="sw-chem-visual-title">Dokowanie (heurystyka) · {result.receptorLabel}</div>
        <FitBar label="Elektrostatyka" value={result.contacts.electrostaticFit} testId="sw-chem-fit-electrostatic" />
        <FitBar label="Hydrofobowość" value={result.contacts.hydrophobicFit} testId="sw-chem-fit-hydrophobic" />
        <FitBar label="Dopasowanie przestrzenne" value={result.contacts.stericFit} testId="sw-chem-fit-steric" />
        <div className="sw-chem-visual-note" data-testid="sw-chem-docking-score">
          Wynik wiązania: {result.bindingScore.toFixed(1)} / 100 · proxy powinowactwa {result.affinityProxyKcalMol} kcal/mol — heurystyka ilustracyjna, nie fizycznie symulowana poza dokowania.
        </div>
      </div>
    );
  }

  if (artifact.kind === 'chemistry-pharmacokinetics') {
    const { profile } = artifact;
    const maxT = Math.max(...profile.series.map((p) => p.tHours), 1e-6);
    const maxC = Math.max(...profile.series.map((p) => p.concentrationMgL), 1e-6);
    const points = profile.series
      .map((p) => `${((p.tHours / maxT) * CHART_W).toFixed(1)},${(CHART_H - (p.concentrationMgL / maxC) * CHART_H).toFixed(1)}`)
      .join(' ');
    return (
      <div className="sw-chem-visual" data-testid="sw-chem-pk-visual">
        <div className="sw-chem-visual-title">Farmakokinetyka (model jednokompartmentowy)</div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width={CHART_W} height={CHART_H} className="sw-chem-pk-chart" role="img" aria-label="Krzywa stężenia w czasie" data-testid="sw-chem-pk-chart">
          <polyline points={points} fill="none" stroke="#9fd7f9" strokeWidth={1.5} />
        </svg>
        <div className="sw-chem-visual-note" data-testid="sw-chem-pk-summary">
          t½ {profile.halfLifeHours.toFixed(2)} h · C<sub>max</sub> (proxy) {profile.cMaxProxyMgL.toFixed(3)} mg/L @ ok. {profile.tMaxHoursApprox.toFixed(2)} h · dawka {profile.doseMg} mg — model edukacyjny, nie zalecenie dawkowania.
        </div>
      </div>
    );
  }

  return null;
}

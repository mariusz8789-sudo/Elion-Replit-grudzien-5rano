import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { kitaevBulkEnergyAtMomentum, solveKitaevBulk, type KitaevBulkParameters, type KitaevBulkPhase } from '../../core/compute/kitaevBulk';

const PHASE_COLOR: Record<KitaevBulkPhase, string> = {
  TOPOLOGICAL_REGIME: '#5cd6e8',
  CRITICAL_BOUNDARY: '#f0b35c',
  TRIVIAL_REGIME: '#a78bfa',
};

function paramsFrom(values: SimParams): KitaevBulkParameters {
  return {
    chemicalPotential: Number(values.chemicalPotential),
    hopping: Number(values.hopping),
    pairing: Number(values.pairing),
  };
}

function phaseLabel(phase: KitaevBulkPhase): string {
  if (phase === 'TOPOLOGICAL_REGIME') return 'reżim topologiczny bulk';
  if (phase === 'CRITICAL_BOUNDARY') return 'granica krytyczna';
  return 'reżim trywialny bulk';
}

/**
 * Canvas Q2 nie ma własnej fizyki. Każdy punkt ±E(k) wywołuje ten sam solver
 * `kitaevBulkEnergyAtMomentum`, z którego Q1 liczy gap i klasyfikację.
 */
class KitaevBulkSim implements Sim {
  private params: KitaevBulkParameters = { chemicalPotential: 0, hopping: 1, pairing: 1 };
  private stats = { bulkGap: 0, invariant: 0, phaseCode: 0 };

  init(_width: number, _height: number) {}

  update(_dt: number, params: SimParams) {
    this.params = paramsFrom(params);
    const solved = solveKitaevBulk(this.params);
    this.stats = {
      bulkGap: solved.bulkGap,
      invariant: solved.topologicalInvariant,
      phaseCode: solved.phase === 'TOPOLOGICAL_REGIME' ? -1 : solved.phase === 'TRIVIAL_REGIME' ? 1 : 0,
    };
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const p = this.params;
    const solved = solveKitaevBulk(p);
    const color = PHASE_COLOR[solved.phase];
    const left = Math.max(48, width * 0.09);
    const right = width - Math.max(20, width * 0.05);
    const top = 34;
    const bottom = height - 36;
    const centerY = (top + bottom) / 2;

    const background = ctx.createRadialGradient(width * 0.5, centerY, 0, width * 0.5, centerY, Math.max(width, height) * 0.7);
    background.addColorStop(0, '#0b1222');
    background.addColorStop(1, '#02030a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    let maxEnergy = 0.1;
    for (let index = 0; index <= 240; index++) {
      const k = -Math.PI + (index / 240) * 2 * Math.PI;
      maxEnergy = Math.max(maxEnergy, kitaevBulkEnergyAtMomentum(k, p));
    }
    maxEnergy *= 1.12;
    const xAt = (k: number) => left + ((k + Math.PI) / (2 * Math.PI)) * (right - left);
    const yAt = (energy: number) => centerY - (energy / maxEnergy) * (centerY - top);

    ctx.strokeStyle = 'rgba(141,151,180,0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, centerY);
    ctx.lineTo(right, centerY);
    ctx.stroke();
    for (const k of [-Math.PI, 0, Math.PI]) {
      const x = xAt(k);
      ctx.strokeStyle = 'rgba(141,151,180,0.16)';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }

    const drawBranch = (sign: 1 | -1) => {
      ctx.beginPath();
      for (let index = 0; index <= 240; index++) {
        const k = -Math.PI + (index / 240) * 2 * Math.PI;
        const x = xAt(k);
        const y = yAt(sign * kitaevBulkEnergyAtMomentum(k, p));
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    drawBranch(1);
    drawBranch(-1);

    const gapX = xAt(solved.momentumAtGap);
    const gapY = yAt(solved.bulkGap);
    ctx.strokeStyle = '#f0b35c';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(gapX, centerY);
    ctx.lineTo(gapX, gapY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b35c';
    ctx.beginPath();
    ctx.arc(gapX, gapY, 3.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(230,234,245,0.92)';
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(`E_g = ${solved.bulkGap.toPrecision(4)}  ·  ${phaseLabel(solved.phase)}`, left, 20);
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('−π', left - 8, height - 16);
    ctx.fillText('0', xAt(0) - 3, height - 16);
    ctx.fillText('π', right - 3, height - 16);
    ctx.fillText('k', right + 6, height - 16);
    ctx.fillText('E(k)', 8, top + 6);
    ctx.fillText('±E(k) z dokładnego bulk BdG · nie jest pomiarem materiału ani symulacją Majorana 1', left, height - 2);
  }

  getStats() {
    return this.stats;
  }

}

export const quantumKitaevBulk: ExperimentDef = {
  id: 'kitaev-bulk',
  name: 'Łańcuch Kitaeva — bulk BdG',
  honesty: 'theoretical',
  honestyNote: 'Q2 rysuje dokładne spektrum bezinterakcyjnego, translacyjnie niezmiennego łańcucha Kitaeva z tego samego solvera co Q1. To model bulk, nie symulacja nanodrutu, materiału InAs–Al, końcowych modów Majorany ani urządzenia Majorana 1. Do utrwalenia confirmed runu z provenance użyj Science Chat: „zasymuluj łańcuch Kitaeva mu=… t=… delta=…”, a następnie potwierdź plan.',
  params: [
    { key: 'chemicalPotential', label: 'Potencjał chemiczny μ', type: 'slider', min: -4, max: 4, step: 0.05, default: 0, unit: 'jedn. energii' },
    { key: 'hopping', label: 'Hopping t', type: 'slider', min: 0.25, max: 2, step: 0.05, default: 1, unit: 'jedn. energii' },
    { key: 'pairing', label: 'Pairing p-wave Δ', type: 'slider', min: 0.1, max: 2, step: 0.05, default: 1, unit: 'jedn. energii' },
  ],
  createSim: () => new KitaevBulkSim(),
  narrate(params) {
    const solved = solveKitaevBulk(paramsFrom(params));
    return [
      {
        title: `${phaseLabel(solved.phase)} · E_g=${solved.bulkGap.toPrecision(4)}`,
        kind: solved.phase === 'CRITICAL_BOUNDARY' ? 'warning' : 'insight',
        body: `Dla μ=${Number(params.chemicalPotential).toPrecision(3)}, t=${Number(params.hopping).toPrecision(3)} i Δ=${Number(params.pairing).toPrecision(3)} solver bulk BdG oblicza minimum pasma przy k=${solved.momentumAtGap.toPrecision(4)} rad. Granice krytyczne tego modelu to μ=${solved.criticalChemicalPotentialNegative.toPrecision(3)} oraz μ=${solved.criticalChemicalPotentialPositive.toPrecision(3)}.`,
      },
      {
        title: 'Co dokładnie pokazuje wykres',
        body: 'Obie krzywe są bezpośrednio obliczonymi gałęziami ±E(k) tego samego hamiltonianu, nie dopasowaniem do danych i nie animacją estetyczną. Przerywana linia wskazuje rzeczywisty bulk gap dla bieżących parametrów.',
      },
      {
        title: 'Granica interpretacji',
        kind: 'warning',
        body: 'Model nie oblicza skończonego przewodu ani danych sprzętowych. Reżim topologiczny bulk nie jest automatycznym dowodem obecności modów Majorany w konkretnym urządzeniu. Do utrwalonego runu z fingerprintem użyj potwierdzonego planu w Science Chat.',
      },
    ];
  },
};

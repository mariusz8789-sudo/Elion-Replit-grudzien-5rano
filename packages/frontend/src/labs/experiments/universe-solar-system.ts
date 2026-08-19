import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { PLANETS, type PlanetData } from '../../data/solarSystem';
import { registerDataSource } from '../../core/dataSource';
import { keplerPosition } from '../../core/physics';

/**
 * Prawdziwy Układ Słoneczny — flagowy eksperyment Universe Lab.
 *
 * Fizyka: rozwiązanie równania Keplera M = E − e·sinE metodą Newtona
 * (8 iteracji, zbiega kwadratowo — dokładność <1e-10 rad dla e<0.99),
 * dające DOKŁADNĄ pozycję na elipsie o prawdziwym mimośrodzie. Względne
 * okresy planet (a więc i to, że Merkury okrąża Słońce ~415× szybciej niż
 * Neptun) są prawdziwe — to samo trzecie prawo Keplera T² ∝ a³, które
 * odkryło Neptuna z zaburzeń orbity Urana (patrz knowledge/classical-mechanics.md).
 *
 * Uczciwe ograniczenia (patrz honestyNote): odległości są skompresowane
 * (skala √a, nie liniowa — inaczej Merkury i Neptun nie zmieściłyby się
 * jednocześnie na ekranie telefonu; standardowa technika w wizualizacjach
 * Układu Słonecznego). Rozmiary planet są symboliczne, nie do skali
 * odległości (Jowisz byłby wtedy niewidoczny albo Merkury zasłoniłby
 * ekran). Kąty startowe są DOWOLNE — to NIE jest żywa efemeryda; prawdziwe
 * "gdzie jest Mars dzisiaj" wymaga NASA JPL Horizons (patrz
 * scripts/fetch-real-data.mjs, do uruchomienia poza tym środowiskiem).
 */

registerDataSource<PlanetData[]>({
  id: 'universe.solar-system-elements',
  label: 'Elementy orbitalne 8 planet (półoś wielka, mimośród, okres, masa, promień)',
  citation: {
    label: 'NASA Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet)',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
    confirmation: 'confirmed',
  },
  isSynthetic: false,
  load: () => PLANETS,
});

function solarPositionAtDays(planet: PlanetData, daysElapsed: number) {
  const meanAnomaly = ((2 * Math.PI * daysElapsed) / planet.periodDays) % (2 * Math.PI);
  const { x, y } = keplerPosition(planet.semiMajorAxisAu, planet.eccentricity, meanAnomaly);
  return { name: planet.name, xAu: x, yAu: y, radiusAu: Math.hypot(x, y) };
}

export function runSolarSystemScenario({ daysElapsed = 365.256 }: { daysElapsed?: number } = {}) {
  if (!Number.isFinite(daysElapsed) || daysElapsed < 0 || daysElapsed > 1_000_000) {
    throw new Error('daysElapsed must be within [0, 1000000].');
  }
  const positions = PLANETS.map((planet) => solarPositionAtDays(planet, daysElapsed));
  const positionOf = (name: string) => positions.find((planet) => planet.name === name)!;
  return {
    daysElapsed,
    planetCount: positions.length,
    mercuryOrbits: daysElapsed / PLANETS[0].periodDays,
    earthOrbits: daysElapsed / PLANETS[2].periodDays,
    mercuryRadiusAu: positionOf('Merkury').radiusAu,
    earthRadiusAu: positionOf('Ziemia').radiusAu,
    neptuneRadiusAu: positionOf('Neptun').radiusAu,
    positions,
  };
}

interface PlanetView extends PlanetData {
  /** Skala px/AU dla TEJ planety (skompresowana skala odległości — patrz komentarz u góry). */
  scale: number;
}

class SolarSystemSim implements Sim {
  private daysElapsed = 0;
  private views: PlanetView[] = [];

  init(w: number, h: number) {
    const rMax = Math.min(w, h) * 0.46;
    const aMax = PLANETS[PLANETS.length - 1].semiMajorAxisAu; // Neptun
    this.views = PLANETS.map((p) => {
      const displayA = rMax * Math.sqrt(p.semiMajorAxisAu / aMax);
      return { ...p, scale: displayA / p.semiMajorAxisAu };
    });
  }

  reset = () => {
    this.daysElapsed = 0;
  };

  update(dt: number, p: SimParams) {
    this.daysElapsed += dt * Number(p.speed);
  }

  private positionAu(planet: PlanetData): { x: number; y: number } {
    const { xAu, yAu } = solarPositionAtDays(planet, this.daysElapsed);
    return { x: xAu, y: yAu };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.views.length === 0) this.init(w, h);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;

    // Słońce w ognisku elipsy
    const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    sunGrad.addColorStop(0, '#fff6d8');
    sunGrad.addColorStop(1, 'rgba(240,179,92,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0d9a0';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    for (const planet of this.views) {
      const b = planet.semiMajorAxisAu * Math.sqrt(1 - planet.eccentricity ** 2);
      // Środek elipsy względem ogniska (Słońca): (−a·e, 0)
      const ellipseCx = cx - planet.semiMajorAxisAu * planet.eccentricity * planet.scale;
      ctx.strokeStyle = 'rgba(230,234,245,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ellipseCx, cy, planet.semiMajorAxisAu * planet.scale, b * planet.scale, 0, 0, Math.PI * 2);
      ctx.stroke();

      const pos = this.positionAu(planet);
      const px = cx + pos.x * planet.scale;
      const py = cy + pos.y * planet.scale;
      const dotR = 2.2 + Math.log10(planet.radiusKm) * 0.9; // symboliczny, nie do skali odległości
      // Poświata skalowana prawdziwym promieniem planety (radiusKm z NASA) —
      // większe planety świecą wyraźniej, nie ozdoba losowa.
      ctx.fillStyle = planet.color;
      ctx.shadowColor = planet.color;
      ctx.shadowBlur = dotR * 1.3;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(230,234,245,0.6)';
      ctx.font = '9px system-ui';
      ctx.fillText(planet.name, px + dotR + 3, py + 3);
    }

    ctx.fillStyle = 'rgba(230,234,245,0.7)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(
      `${Math.round(this.daysElapsed).toLocaleString('pl-PL')} dni ziemskich · skala odległości: √a (skompresowana)`,
      10,
      h - 12,
    );
  }

  getStats() {
    const mercuryOrbits = this.daysElapsed / PLANETS[0].periodDays;
    const earthOrbits = this.daysElapsed / PLANETS[2].periodDays;
    return {
      daysElapsed: Math.round(this.daysElapsed),
      mercuryOrbits: Math.round(mercuryOrbits * 100) / 100,
      earthOrbits: Math.round(earthOrbits * 100) / 100,
    };
  }
}

export const universeSolarSystem: ExperimentDef = {
  id: 'solar-system',
  name: 'Prawdziwy Układ Słoneczny',
  honesty: 'exact',
  honestyNote:
    'Półoś wielka, mimośród i okres każdej planety to prawdziwe stałe NASA (Planetary Fact Sheet), a pozycja liczona przez dokładne rozwiązanie równania Keplera — kształt orbit i względne okresy są rzeczywiste. Skala odległości skompresowana (√a) i rozmiary planet symboliczne, żeby zmieścić Merkurego i Neptuna na jednym ekranie. Kąty startowe są dowolne — to nie jest żywa efemeryda z NASA JPL Horizons (wymaga sieci, patrz scripts/fetch-real-data.mjs).',
  params: [
    {
      key: 'speed', label: 'Tempo czasu', type: 'slider',
      min: 1, max: 400, step: 1, default: 60, unit: 'dni/s',
    },
  ],
  createSim: () => new SolarSystemSim(),
  narrate(_p, stats) {
    const days = Number(stats.daysElapsed ?? 0);
    const mercuryOrbits = Number(stats.mercuryOrbits ?? 0);
    const earthOrbits = Number(stats.earthOrbits ?? 0);
    return [
      {
        title: days < 200 ? 'Patrz na Merkurego' : `Merkury: ${mercuryOrbits.toFixed(2)} okrążenia`,
        body: 'Merkury okrąża Słońce w 88 dni, Neptun — w 165 lat (60 190 dni): to samo trzecie prawo Keplera T² ∝ a³, tylko dwa skrajne przypadki. Merkury zdąży okrążyć Słońce ponad 400 razy, zanim Neptun zamknie jeden obieg.',
        citation: {
          source: 'NASA Planetary Fact Sheet',
          confirmation: 'confirmed',
          url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
          note: 'Półoś wielka, mimośród i okres orbitalny wszystkich planet',
        },
      },
      {
        title: 'Elipsy, nie koła',
        body: `Merkury ma mimośród 0,206 — jego odległość od Słońca zmienia się o ${(0.2056 * 2 * 100).toFixed(0)}% między peryhelium a aphelium, widoczne gołym okiem na tej symulacji jako spłaszczona orbita. Ziemia (e=0,017) jest za to niemal idealnym kołem.`,
      },
      ...(earthOrbits >= 1
        ? [
            {
              title: 'Rok Ziemski minął',
              body: `Ziemia właśnie zamknęła ${Math.floor(earthOrbits)}. pełny obieg w tej symulacji (365,256 dnia) — dokładnie tyle, ile trwa prawdziwy rok zwrotnikowy.`,
            },
          ]
        : []),
    ];
  },
};

import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { gaussianPdf, measurementTensionSigma } from '../../core/physics';

/**
 * Napięcie Hubble'a — realny, aktywny, nierozstrzygnięty spór kosmologiczny
 * (nie hipoteza brzegowa): dwie niezależne metody pomiaru stałej Hubble'a
 * H₀ dają wyniki rozbieżne o ~5σ, dużo więcej niż wynikałoby z samych
 * podanych niepewności statystycznych. To NIE spór o to, "czy Wszechświat
 * się rozszerza" (★★★★★ potwierdzone) — to spór o DOKŁADNĄ wartość jednej
 * stałej, z dwiema możliwymi przyczynami: (a) nieznana systematyka
 * pomiarowa w jednej lub obu metodach, (b) nowa fizyka poza standardowym
 * modelem ΛCDM (wczesna ciemna energia, dodatkowe neutrina). Obie
 * możliwości są traktowane w literaturze poważnie — Genesis OS nie
 * faworyzuje żadnej.
 */

interface Method { id: string; name: string; h0: number; sigma: number; color: string; citation: string }

const METHODS: Method[] = [
  { id: 'shoes', name: 'SH0ES (cefeidy + supernowe Ia, lokalny Wszechświat)', h0: 73.04, sigma: 1.04, color: '#f0b35c', citation: 'Riess i in. (2022), ApJL 934, L7' },
  { id: 'planck', name: 'Planck (CMB, przy założeniu modelu ΛCDM)', h0: 67.4, sigma: 0.5, color: '#5cd6e8', citation: 'Planck Collaboration (2020), A&A 641, A6' },
  { id: 'trgb', name: 'TRGB (czubek gałęzi czerwonych olbrzymów)', h0: 69.8, sigma: 1.7, color: '#c68cff', citation: 'Freedman i in. (2021), ApJ 919, 16' },
];

const X_MIN = 60;
const X_MAX = 80;

class HubbleTensionSim implements Sim {
  private showTrgb = true;
  private extraSystematic = 0;
  private t = 0;

  init() {}
  reset = () => {};

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.showTrgb = Boolean(p.showTrgb);
    this.extraSystematic = Number(p.extraSystematic ?? 0);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    const padL = 34;
    const padR = 14;
    const padT = 16;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const toX = (h0: number) => padL + ((h0 - X_MIN) / (X_MAX - X_MIN)) * plotW;

    ctx.strokeStyle = 'rgba(230,234,245,0.08)';
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(230,234,245,0.45)';
    for (let h0 = X_MIN; h0 <= X_MAX; h0 += 5) {
      const x = toX(h0);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText(`${h0}`, x - 6, padT + plotH + 12);
    }
    ctx.fillText('H₀ [km/s/Mpc]', padL + plotW - 52, padT + plotH + 24);

    const visible = METHODS.filter((m) => m.id !== 'trgb' || this.showTrgb);
    for (const method of visible) {
      const peak = gaussianPdf(method.h0, method.h0, method.sigma);
      ctx.beginPath();
      ctx.strokeStyle = method.color;
      ctx.lineWidth = 2;
      let started = false;
      for (let i = 0; i <= 200; i++) {
        const h0 = X_MIN + (i / 200) * (X_MAX - X_MIN);
        const density = gaussianPdf(h0, method.h0, method.sigma) / peak;
        const x = toX(h0);
        const y = padT + plotH - density * plotH * 0.88;
        if (!started) {
          ctx.moveTo(x, padT + plotH);
          started = true;
        }
        ctx.lineTo(x, y);
      }
      ctx.lineTo(toX(X_MAX), padT + plotH);
      ctx.closePath();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = method.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();

      const peakX = toX(method.h0);
      ctx.fillStyle = method.color;
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${method.h0.toFixed(1)}`, peakX, padT + plotH - plotH * 0.9 - 6);
      ctx.textAlign = 'left';
    }

    const tension = measurementTensionSigma(
      METHODS[0].h0, METHODS[0].sigma,
      METHODS[1].h0, METHODS[1].sigma + this.extraSystematic,
    );
    ctx.fillStyle = tension > 3 ? '#f47c7c' : tension > 1.5 ? '#f0b35c' : '#6ee7a0';
    ctx.font = '600 11px system-ui';
    ctx.fillText(`napięcie SH0ES↔Planck: ${tension.toFixed(2)}σ`, 10, h - 14);
  }

  getStats() {
    const tension = measurementTensionSigma(
      METHODS[0].h0, METHODS[0].sigma,
      METHODS[1].h0, METHODS[1].sigma + this.extraSystematic,
    );
    return {
      tensionSigma: Math.round(tension * 100) / 100,
      shoesH0: METHODS[0].h0,
      planckH0: METHODS[1].h0,
      gapPercent: Math.round(((METHODS[0].h0 - METHODS[1].h0) / METHODS[1].h0) * 1000) / 10,
    };
  }
}

export const universeHubbleTension: ExperimentDef = {
  id: 'hubbletension',
  name: 'Napięcie Hubble’a',
  honesty: 'simplified',
  honestyNote:
    'Wartości H₀ i niepewności to prawdziwe, opublikowane wyniki (Riess i in. 2022; Planck Collaboration 2020; Freedman i in. 2021) — nie synteza. Krzywe znormalizowane do tej samej wysokości szczytu dla czytelności porównania, NIE do tego samego pola pod krzywą (co pokazywałoby prawdziwą gęstość prawdopodobieństwa). "Napięcie" liczone jako różnica podzielona przez niepewności złożone w kwadraturze — standardowa metoda w fizyce doświadczalnej, ale to WCIĄŻ przedmiot aktywnej debaty, czy 5σ oznacza nową fizykę czy nieznaną systematykę.',
  params: [
    { key: 'showTrgb', label: 'Pokaż TRGB (trzecia, niezależna metoda)', type: 'toggle', default: true },
    { key: 'extraSystematic', label: 'Hipotetyczna dodatkowa systematyka (Planck)', type: 'slider', min: 0, max: 3, step: 0.1, default: 0, unit: 'km/s/Mpc' },
  ],
  createSim: () => new HubbleTensionSim(),
  narrate(p, stats) {
    const tension = Number(stats.tensionSigma ?? 0);
    const extraSys = Number(p.extraSystematic ?? 0);
    const showTrgb = Boolean(p.showTrgb);
    const blocks = [
      {
        title: `Napięcie: ${tension.toFixed(2)}σ`,
        body:
          tension > 3
            ? `Rozbieżność ${tension.toFixed(1)}σ jest zbyt duża, by wytłumaczyć ją zwykłym przypadkiem statystycznym (próg "odkrycia" w fizyce cząstek to zwykle 5σ) — to dlatego nazywa się to "napięciem", nie zwykłym błędem pomiaru. Albo jedna z metod ma nieznaną systematykę, albo standardowy model kosmologiczny (ΛCDM) wymaga poprawki.`
            : `Dodanie hipotetycznej, dodatkowej systematyki ${extraSys.toFixed(1)} km/s/Mpc do niepewności Plancka sprowadza rozbieżność poniżej progu, który zwykle uznaje się za istotny — tyle "ukrytej" niepewności wystarczyłoby, by "rozwiązać" napięcie bez odwoływania się do nowej fizyki. To właśnie dlatego część kosmologów podejrzewa nieznaną systematykę, nie nową fizykę.`,
        citation: { source: 'Riess i in. (2022), ApJL 934, L7 · Planck Collaboration (2020), A&A 641, A6', confirmation: 'confirmed' as const, note: 'Opublikowane wartości H₀ i niepewności obu zespołów' },
      },
      {
        title: 'Dwie hipotezy, obie traktowane poważnie',
        body: 'SH0ES mierzy H₀ BEZPOŚREDNIO z drabiny odległości (cefeidy → supernowe Ia) w pobliskim Wszechświecie — nie zakłada żadnego modelu kosmologicznego. Planck wyprowadza H₀ POŚREDNIO z widma mikrofalowego promieniowania tła (CMB), zakładając model ΛCDM. Jeśli ΛCDM jest niekompletny (np. brakuje "wczesnej ciemnej energii" albo dodatkowego typu neutrin), pomiar Plancka byłby systematycznie przesunięty — to jedna z głównych hipotez "nowej fizyki".',
      },
      showTrgb
        ? {
            title: 'TRGB: trzecia metoda, trzeci wynik',
            body: 'Metoda TRGB (czubek gałęzi czerwonych olbrzymów, alternatywa dla cefeid w drabinie odległości) daje wynik POMIĘDZY SH0ES a Planckiem — ani jednoznacznie potwierdza, ani obala żadną ze stron. To realny, otwarty stan wiedzy: napięcie Hubble’a NIE jest prostym sporem dwustronnym, tylko całym spektrum wyników o różnej metodologii i różnych potencjalnych systematykach.',
            citation: { source: 'Freedman i in. (2021), ApJ 919, 16', confirmation: 'confirmed' as const, note: 'Niezależny pomiar metodą TRGB' },
          }
        : {
            title: 'Eksperyment do wykonania',
            body: 'Włącz TRGB (trzecia metoda) i zobacz, że wynik ląduje między SH0ES a Planckiem — dokładnie taki obraz sporu naukowcy widzą naprawdę, nie tylko dwie skrajności.',
          },
      {
        title: 'Dlaczego to dobry przykład "nauki w toku"',
        body: 'Wiele popularnonaukowych relacji przedstawia naukę jako zamkniętą księgę faktów — napięcie Hubble’a jest uczciwym kontrprzykładem: setki najlepszych kosmologów na świecie, najlepsze dostępne dane, a mimo to spór trwa od lat i nie ma zgody, czy przyczyną jest błąd pomiarowy, czy nowa fizyka. To dokładnie to, jak nauka wygląda na żywym froncie badań, nie w podręczniku.',
      },
    ];
    return blocks;
  },
};

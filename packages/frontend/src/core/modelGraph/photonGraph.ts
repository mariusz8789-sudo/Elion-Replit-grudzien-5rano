import { ModelGraph } from './graph';

/**
 * Quantum Lab × Graf Modeli — kwant światła (Priorytet 1). Kwantyzacja energii
 * fotonu E = hc/λ oraz f = c/λ (DOKŁADNE). Dodatkowo krawędź MIĘDZYDZIEDZINOWA
 * do chemii: ta sama energia fotonu wyrażona w kJ/mol (1 eV = 96,485 kJ/mol,
 * przelicznik ścisły) pozwala porównać ją z energiami wiązań chemicznych —
 * np. czy foton rozerwie wiązanie. To realne połączenie kwantów ze skalą
 * energetyczną chemii.
 */

const HC_EV_NM = 1239.841984; // hc w eV·nm
const C_NM_THZ = 299792.458; // c wyrażone tak, że f[THz] = C/λ[nm]
const EV_TO_KJMOL = 96.485332; // 1 eV = 96,485 kJ/mol (ścisły przelicznik)

export const BASELINE_WAVELENGTH_NM = 500;

export function buildPhotonGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'wavelengthNm', label: 'Długość fali λ', unit: 'nm', domain: 'mechanika kwantowa (foton)',
      honesty: 'exact', honestyNote: 'Długość fali fotonu (widzialne ~380–740 nm) — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => Math.max(1e-3, i.wavelengthNm ?? BASELINE_WAVELENGTH_NM), formula: 'λ (parametr)' },
    BASELINE_WAVELENGTH_NM,
  );

  g.addNode({
    id: 'photonEnergyEV', label: 'Energia fotonu E', unit: 'eV', domain: 'mechanika kwantowa (foton)',
    honesty: 'exact', honestyNote: 'E = hc/λ. DOKŁADNE (hc = 1239,84 eV·nm). Dla 500 nm ≈ 2,48 eV.',
    derivation: 'direct', inputs: ['wavelengthNm'], compute: (i) => HC_EV_NM / i.wavelengthNm,
    formula: 'E = hc/λ',
  });
  g.addNode({
    id: 'photonFrequencyTHz', label: 'Częstotliwość f', unit: 'THz', domain: 'mechanika kwantowa (foton)',
    honesty: 'exact', honestyNote: 'f = c/λ. DOKŁADNE. Dla 500 nm ≈ 600 THz (światło zielone).',
    derivation: 'direct', inputs: ['wavelengthNm'], compute: (i) => C_NM_THZ / i.wavelengthNm,
    formula: 'f = c/λ',
  });
  g.addNode({
    id: 'photonEnergyKJmol', label: 'Energia fotonu (skala chemiczna)', unit: 'kJ/mol', domain: 'chemia (energia wiązań)',
    honesty: 'exact',
    honestyNote: 'KRAWĘDŹ MIĘDZYDZIEDZINOWA: energia fotonu (kwantowa) przeliczona na skalę chemiczną (1 eV = 96,485 kJ/mol, ściśle). Pozwala porównać z energiami wiązań: C–C ≈ 348, C=O ≈ 745 kJ/mol. Foton UV (~400 kJ/mol) może rozrywać niektóre wiązania — sedno fotochemii.',
    derivation: 'direct', inputs: ['photonEnergyEV'], compute: (i) => i.photonEnergyEV * EV_TO_KJMOL,
    formula: 'E[kJ/mol] = E[eV]·96,485',
  });

  return g;
}

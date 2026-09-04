/**
 * Model HP (Hydrophobic–Polar) fałdowania białek — Dill 1985 (Biochem.
 * 24, 1501); Lau & Dill 1989 (Macromolecules 22, 3986). Standardowy,
 * świadomie UPROSZCZONY model dydaktyczny: sekwencja aminokwasów
 * zredukowana do dwóch typów (H=hydrofobowy, P=polarny), łańcuch to
 * samounikający spacer na siatce kwadratowej 2D, energia = −1 za każdy
 * kontakt H–H NIENALEŻĄCY do szkieletu (sąsiedztwo na siatce, ale nie
 * sąsiedztwo w sekwencji). To NIE symulacja prawdziwego zwijania białek
 * (AlphaFold i rzeczywista biofizyka operują na 20 aminokwasach, pełnej
 * geometrii 3D i oddziaływaniach elektrostatycznych/wodorowych) — model
 * HP bada wyłącznie JEDNĄ, fundamentalną zasadę: zapadanie hydrofobowe
 * (hydrofobowe reszty chowają się przed wodą, tworząc zwarty rdzeń) —
 * i robi to poprawnie jakościowo, w pełni ścisłej matematyce na siatce.
 *
 * Znajdowanie stanu o najniższej energii jest udowodnione NP-trudne
 * (Crescenzi i in. 1998, "On the complexity of protein folding") — ta
 * symulacja robi lokalne przeszukiwanie Monte Carlo (algorytm
 * Metropolisa, ta sama metoda co model Isinga w Chemistry Lab), które
 * może utknąć w minimum lokalnym — dokładnie jak prawdziwe błędne
 * fałdowanie (misfolding) w biologii.
 */

export type Residue = 'H' | 'P';
export interface Point { x: number; y: number }

const LATTICE_DIRS: Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function parseSequence(s: string): Residue[] {
  const out: Residue[] = [];
  for (const c of s.toUpperCase()) {
    if (c === 'H' || c === 'P') out.push(c);
  }
  return out;
}

/** Prosty łańcuch startowy — samounikający z definicji (wszystkie punkty na jednej linii, różne x). */
export function straightChain(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));
}

function posKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function isOccupied(positions: Point[], p: Point, excludeIndex: number): boolean {
  for (let i = 0; i < positions.length; i++) {
    if (i === excludeIndex) continue;
    if (positions[i].x === p.x && positions[i].y === p.y) return true;
  }
  return false;
}

/**
 * Energia kontaktowa modelu HP: −1 za każdą parę reszt H, które sąsiadują
 * na siatce, ale NIE sąsiadują w sekwencji (czyli nie są połączone
 * wiązaniem szkieletu). Dokładny wzór Lau & Dill (1989), nie przybliżenie.
 */
export function contactEnergy(sequence: Residue[], positions: Point[]): number {
  const indexAt = new Map<string, number>();
  positions.forEach((p, i) => indexAt.set(posKey(p), i));
  let energy = 0;
  for (let i = 0; i < sequence.length; i++) {
    if (sequence[i] !== 'H') continue;
    for (const d of LATTICE_DIRS) {
      const neighbor = { x: positions[i].x + d.x, y: positions[i].y + d.y };
      const j = indexAt.get(posKey(neighbor));
      if (j === undefined || j <= i) continue;
      if (j - i === 1) continue; // sąsiedzi w łańcuchu — wiązanie szkieletu, nie "kontakt"
      if (sequence[j] === 'H') energy -= 1;
    }
  }
  return energy;
}

/** Liczy WSZYSTKIE kontakty (H–H) w konformacji — do statystyk (np. procent maksymalnej możliwej gęstości upakowania). */
export function contactCount(sequence: Residue[], positions: Point[]): number {
  return -contactEnergy(sequence, positions);
}

function tryEndMove(positions: Point[], index: number, rnd: () => number): Point | null {
  const anchor = index === 0 ? positions[1] : positions[positions.length - 2];
  const candidates = LATTICE_DIRS
    .map((d) => ({ x: anchor.x + d.x, y: anchor.y + d.y }))
    .filter((p) => !isOccupied(positions, p, index) && !(p.x === positions[index].x && p.y === positions[index].y));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rnd() * candidates.length)];
}

/**
 * Ruch narożnikowy: reszta i (wewnętrzna) leżąca w "narożniku" między
 * i-1 i i+1 (czyli i-1 i i+1 są ustawione po przekątnej) może przeskoczyć
 * na drugi punkt siatki, który jest sąsiadem OBU i-1 i i+1 jednocześnie —
 * standardowy ruch Monte Carlo modelu HP na siatce kwadratowej.
 */
function tryCornerMove(positions: Point[], index: number): Point | null {
  const prev = positions[index - 1];
  const next = positions[index + 1];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return null; // nie narożnik (linia prosta) — brak ruchu
  const optionA: Point = { x: prev.x + dx, y: prev.y };
  const optionB: Point = { x: prev.x, y: prev.y + dy };
  const current = positions[index];
  const alt = current.x === optionA.x && current.y === optionA.y ? optionB : optionA;
  if (isOccupied(positions, alt, index)) return null;
  return alt;
}

export interface McStepResult { positions: Point[]; accepted: boolean; energy: number }

/**
 * Jeden krok algorytmu Metropolisa (Metropolis i in. 1953) na konformacji
 * łańcucha: losuje resztę, próbuje dopuszczalny ruch (koniec/narożnik),
 * akceptuje z prawdopodobieństwem min(1, e^(−ΔE/T)) — identyczna zasada
 * co model Isinga (Chemistry Lab), tu zastosowana do przestrzeni
 * konformacyjnej łańcucha zamiast do siatki spinów.
 */
export function mcStep(sequence: Residue[], positions: Point[], temperature: number, rnd: () => number = Math.random): McStepResult {
  const n = positions.length;
  const index = Math.floor(rnd() * n);
  const proposal = index === 0 || index === n - 1 ? tryEndMove(positions, index, rnd) : tryCornerMove(positions, index);
  const currentEnergy = contactEnergy(sequence, positions);
  if (!proposal) return { positions, accepted: false, energy: currentEnergy };
  const newPositions = positions.slice();
  newPositions[index] = proposal;
  const newEnergy = contactEnergy(sequence, newPositions);
  const dE = newEnergy - currentEnergy;
  if (dE <= 0 || rnd() < Math.exp(-dE / temperature)) {
    return { positions: newPositions, accepted: true, energy: newEnergy };
  }
  return { positions, accepted: false, energy: currentEnergy };
}

/** Sprawdza samounikanie (brak dwóch reszt w tym samym punkcie) — niezmiennik, który MUSI zachować każdy poprawny ruch. */
export function isSelfAvoiding(positions: Point[]): boolean {
  const seen = new Set<string>();
  for (const p of positions) {
    const k = posKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/** Sprawdza spójność łańcucha (każda kolejna para reszt sąsiaduje na siatce) — drugi niezmiennik poprawnej konformacji. */
export function isConnected(positions: Point[]): boolean {
  for (let i = 1; i < positions.length; i++) {
    const d = Math.abs(positions[i].x - positions[i - 1].x) + Math.abs(positions[i].y - positions[i - 1].y);
    if (d !== 1) return false;
  }
  return true;
}

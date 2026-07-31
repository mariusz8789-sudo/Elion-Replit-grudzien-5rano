/**
 * Czyste funkcje fizyczne Genesis OS — wspólne dla symulacji i testów.
 * Zero zależności od UI. Każda funkcja odpowiada wzorowi z knowledge/.
 */

/** Czynnik Lorentza γ = 1/√(1−β²). */
export function lorentzGamma(beta: number): number {
  return 1 / Math.sqrt(1 - beta * beta);
}

/** Czas zdarzenia w układzie ruchomym: ct' = γ(ct − βx). */
export function lorentzTime(ct: number, x: number, beta: number): number {
  return lorentzGamma(beta) * (ct - beta * x);
}

/** Pozycje obrazów soczewki punktowej (w jednostkach θ_E): θ± = ½(β ± √(β²+4)). */
export function lensImagePositions(beta: number): [number, number] {
  const d = Math.sqrt(beta * beta + 4);
  return [0.5 * (beta + d), 0.5 * (beta - d)];
}

/** Łączne wzmocnienie mikrosoczewkowania: A(u) = (u²+2)/(u√(u²+4)). */
export function lensAmplification(u: number): number {
  const uu = Math.max(u, 1e-9);
  return (uu * uu + 2) / (uu * Math.sqrt(uu * uu + 4));
}

/** Prawo rozpadu: ułamek pozostały po t okresach półtrwania. */
export function decayRemaining(halfLives: number): number {
  return Math.pow(0.5, halfLives);
}

/** Moc cywilizacji wg wzoru Sagana: P = 10^(10K+6) W. */
export function kardashevPower(K: number): number {
  return Math.pow(10, 10 * K + 6);
}

/** Promień Schwarzschilda r_s = 2GM/c² [m] dla masy w kg. */
export function schwarzschildRadius(massKg: number): number {
  const G = 6.674e-11;
  const C = 2.998e8;
  return (2 * G * massKg) / (C * C);
}

/**
 * Korelacja spinowa singletu: E(a,b) = −cos(a−b) — dokładny wynik MK
 * dla pomiarów spinu pod kątami a, b (radiany).
 */
export function singletCorrelation(a: number, b: number): number {
  return -Math.cos(a - b);
}

/**
 * Wartość CHSH: S = E(a,b) − E(a,b') + E(a',b) + E(a',b').
 * Lokalny realizm: |S| ≤ 2. Mechanika kwantowa: |S| ≤ 2√2 (granica Tsirelsona).
 */
export function chshS(
  E: (x: number, y: number) => number,
  a: number,
  aP: number,
  b: number,
  bP: number,
): number {
  return E(a, b) - E(a, bP) + E(aP, b) + E(aP, bP);
}

/**
 * Losowanie pary wyników pomiaru singletu (A, B ∈ {−1, +1}) zgodnie z MK:
 * ⟨AB⟩ = −cos(a−b), rozkłady brzegowe 50/50.
 */
export function sampleSingletPair(a: number, b: number, rnd: () => number = Math.random): [number, number] {
  const A = rnd() < 0.5 ? 1 : -1;
  const pSame = (1 + singletCorrelation(a, b)) / 2; // P(B = A)
  const B = rnd() < pSame ? A : -A;
  return [A, B];
}

/**
 * Model lokalnych ukrytych zmiennych: wspólna zmienna λ ~ U(0, 2π),
 * wynik deterministyczny sign(cos(θ−λ)). Daje korelację trójkątną
 * E(Δ) = −1 + 2Δ/π (dla Δ∈[0,π]) i nigdy nie łamie |S| ≤ 2.
 */
export function sampleLocalHiddenPair(a: number, b: number, rnd: () => number = Math.random): [number, number] {
  const lambda = rnd() * Math.PI * 2;
  const sign = (x: number) => (Math.cos(x) >= 0 ? 1 : -1);
  return [sign(a - lambda), -sign(b - lambda)];
}

/**
 * Anomalia mimośrodowa E z równania Keplera M = E − e·sinE, metodą Newtona
 * (8 iteracji — zbiega kwadratowo, błąd <1e-10 rad dla e<0.99, czyli dla
 * wszystkich planet Układu Słonecznego z dużym zapasem).
 */
export function solveKepler(meanAnomaly: number, e: number): number {
  let E = meanAnomaly;
  for (let i = 0; i < 8; i++) {
    E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
  }
  return E;
}

/** Pozycja heliocentryczna [AU] na orbicie eliptycznej o półosi a i mimośrodzie e. */
export function keplerPosition(semiMajorAxisAu: number, eccentricity: number, meanAnomaly: number): { x: number; y: number } {
  const E = solveKepler(meanAnomaly, eccentricity);
  return {
    x: semiMajorAxisAu * (Math.cos(E) - eccentricity),
    y: semiMajorAxisAu * Math.sqrt(1 - eccentricity ** 2) * Math.sin(E),
  };
}

/**
 * Półempiryczny wzór na masę (SEMF / Weizsäcker) — energia wiązania jądra
 * o Z protonach i N neutronach [MeV]. Współczynniki i postać wzoru dokładnie
 * jak w knowledge/nuclear.md: B = a_V·A − a_S·A^⅔ − a_C·Z(Z−1)/A^⅓
 * − a_A·(A−2Z)²/A ± δ·A^(−½). Model (★★★★), nie zmierzone dane per jądro —
 * wyjaśnia kształt doliny stabilności, ale pomija efekty powłokowe (dlatego
 * realne maksimum B/A leży przy Ni-62/Fe-58, nie dokładnie tam, gdzie
 * przewiduje ten wzór).
 */
const SEMF_A_V = 15.8;
const SEMF_A_S = 17.8;
const SEMF_A_C = 0.711;
const SEMF_A_A = 23.7;
const SEMF_DELTA = 11.18;

export function semfBindingEnergy(z: number, n: number): number {
  const a = z + n;
  if (a <= 0 || z < 0 || n < 0) return 0;
  const volume = SEMF_A_V * a;
  const surface = SEMF_A_S * Math.pow(a, 2 / 3);
  const coulomb = (SEMF_A_C * z * (z - 1)) / Math.pow(a, 1 / 3);
  const asymmetry = (SEMF_A_A * (a - 2 * z) ** 2) / a;
  const evenZ = z % 2 === 0;
  const evenN = n % 2 === 0;
  const pairing = evenZ && evenN ? SEMF_DELTA / Math.sqrt(a) : !evenZ && !evenN ? -SEMF_DELTA / Math.sqrt(a) : 0;
  return volume - surface - coulomb - asymmetry + pairing;
}

/** Energia wiązania na nukleon [MeV] — miara "jak mocno związane" jest jądro. */
export function semfBindingPerNucleon(z: number, n: number): number {
  const a = z + n;
  return a > 0 ? semfBindingEnergy(z, n) / a : 0;
}

/**
 * Kierunek przewidywany przez SEMF dla rozpadu beta przy stałym A: porównuje
 * energię wiązania sąsiednich izobarów (Z−1,N+1) i (Z+1,N−1). Dodatnia
 * wartość → sąsiad o wyższym Z jest silniej związany (favoryzuje β⁻,
 * n→p); ujemna → favoryzuje β⁺/EC (p→n). Zero w minimum (dolina stabilności).
 */
export function semfStabilityGradient(z: number, n: number): number {
  const up = z + 1 >= 1 && n - 1 >= 0 ? semfBindingEnergy(z + 1, n - 1) : -Infinity;
  const down = z - 1 >= 0 && n + 1 >= 0 ? semfBindingEnergy(z - 1, n + 1) : -Infinity;
  const here = semfBindingEnergy(z, n);
  return Math.max(up - here, 0) - Math.max(down - here, 0);
}

/**
 * Równanie geodezyjnej zerowej Schwarzschilda (tor fotonu wokół czarnej
 * dziury) — d²u/dφ² = −u + (3/2)r_s·u², u=1/r. Wydzielone z
 * einstein-geodesics.ts (2D), żeby einstein-blackhole-3d.ts (3D) używały
 * DOKŁADNIE tej samej, raz przetestowanej fizyki — różni się tylko to, jak
 * (r,φ) mapuje się na piksele/scenę.
 */
export function schwarzschildGeodesicRHS(u: number, rsUnits: number): number {
  return -u + 1.5 * rsUnits * u * u;
}

/** Krytyczny parametr zderzenia b_c/r_s = 3√3/2 ≈ 2,598 — granica wychwytu fotonu. */
export const SCHWARZSCHILD_CRITICAL_IMPACT = (3 * Math.sqrt(3)) / 2;

/** Jeden krok RK4 całkowania geodezyjnej zerowej po kącie φ. */
export function stepSchwarzschildGeodesic(u: number, du: number, dphi: number, rsUnits: number): { u: number; du: number } {
  const f = (uu: number) => schwarzschildGeodesicRHS(uu, rsUnits);
  const k1u = du;
  const k1d = f(u);
  const k2u = du + 0.5 * dphi * k1d;
  const k2d = f(u + 0.5 * dphi * k1u);
  const k3u = du + 0.5 * dphi * k2d;
  const k3d = f(u + 0.5 * dphi * k2u);
  const k4u = du + dphi * k3d;
  const k4d = f(u + dphi * k3u);
  return {
    u: u + (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u),
    du: du + (dphi / 6) * (k1d + 2 * k2d + 2 * k3d + k4d),
  };
}

/**
 * Geodezyjna zerowa Kerra w PŁASZCZYŹNIE RÓWNIKOWEJ (θ=π/2, stała Cartera
 * Q=0) — dokładne równania Boyer–Lindquist (Carter 1968), M=1 (r, a w
 * jednostkach masy czarnej dziury), u=1/r, b=L/E parametr zderzenia.
 * Wyprowadzenie: standardowe równania Cartera dla dφ/dλ i dr/dλ,
 * zredukowane do równika, przekształcone (jak Binet w mechanice orbitalnej)
 * do (du/dφ)² = F(u), żeby uniknąć jawnego pierwiastka przy punkcie
 * zawrotnym (ten sam trik co d²u/dφ²=−u+1,5r_su² dla Schwarzschilda —
 * przypadek szczególny a=0 poniżej).
 *
 * Weryfikacja (patrz kerr.test.ts):
 * - przy a=0, F(u) redukuje się DOKŁADNIE do 1/b²−u²+2Mu³ (Schwarzschild),
 *   a stepKerrEquatorialGeodesic daje identyczne tory co
 *   stepSchwarzschildGeodesic (ta sama fizyka, inna parametryzacja)
 * - promień fotosfery r̂_±=2M[1+cos((2/3)arccos(∓a/M))] i krytyczny
 *   parametr zderzenia b_±=±3√(Mr̂_±)−a (Bardeen 1972; Teo 2003) odtwarzają
 *   znane granice ekstremalnej Kerra: r̂_pro=M, r̂_retro=4M przy a=M
 */
function kerrQ(u: number, a: number, b: number, mass: number): number {
  return 1 + (a * a - b * b) * u * u + 2 * mass * (b - a) ** 2 * u ** 3;
}

function kerrDeltaTilde(u: number, a: number, mass: number): number {
  return 1 - 2 * mass * u + a * a * u * u;
}

/** F(u) = (du/dφ)² — nieujemna z konstrukcji, więc bez niejednoznaczności znaku przy zawrocie. */
export function kerrEquatorialF(u: number, a: number, b: number, mass: number): number {
  const deltaTilde = kerrDeltaTilde(u, a, mass);
  const n = b - 2 * mass * u * (b - a);
  if (n === 0) return 0;
  return (kerrQ(u, a, b, mass) * deltaTilde * deltaTilde) / (n * n);
}

/**
 * d²u/dφ² = F'(u)/2, wyznaczone różnicą centralną 4. rzędu zamiast ręcznej
 * pochodnej symbolicznej ilorazu wielomianów — świadomy wybór inżynierski,
 * bo F(u) jest gładka i dobrze uwarunkowana, a unika ryzyka błędu w długim
 * wyprowadzeniu reguły ilorazu (błąd algebraiczny byłby trudniejszy do
 * wykrycia niż błąd numeryczny rzędu ~1e-9, nieistotny dla wizualizacji).
 */
function kerrFPrime(u: number, a: number, b: number, mass: number): number {
  const h = 1e-6;
  const fm2 = kerrEquatorialF(u - 2 * h, a, b, mass);
  const fm1 = kerrEquatorialF(u - h, a, b, mass);
  const fp1 = kerrEquatorialF(u + h, a, b, mass);
  const fp2 = kerrEquatorialF(u + 2 * h, a, b, mass);
  return (fm2 - 8 * fm1 + 8 * fp1 - fp2) / (12 * h);
}

function kerrEquatorialRHS(u: number, a: number, b: number, mass: number): number {
  return kerrFPrime(u, a, b, mass) / 2;
}

/** Jeden krok RK4 całkowania geodezyjnej równikowej Kerra po kącie φ. */
export function stepKerrEquatorialGeodesic(
  u: number,
  du: number,
  dphi: number,
  a: number,
  b: number,
  mass: number,
): { u: number; du: number } {
  const f = (uu: number) => kerrEquatorialRHS(uu, a, b, mass);
  const k1u = du;
  const k1d = f(u);
  const k2u = du + 0.5 * dphi * k1d;
  const k2d = f(u + 0.5 * dphi * k1u);
  const k3u = du + 0.5 * dphi * k2d;
  const k3d = f(u + 0.5 * dphi * k2u);
  const k4u = du + dphi * k3d;
  const k4d = f(u + dphi * k3u);
  return {
    u: u + (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u),
    du: du + (dphi / 6) * (k1d + 2 * k2d + 2 * k3d + k4d),
  };
}

/** Promień horyzontu zewnętrznego: r+ = M + √(M²−a²) (a≤M). */
export function kerrHorizonRadius(a: number, mass: number): number {
  return mass + Math.sqrt(Math.max(0, mass * mass - a * a));
}

/** Ergosfera na równiku: r_ergo(θ=π/2) = 2M, niezależnie od spinu. */
export function kerrErgosphereEquatorRadius(mass: number): number {
  return 2 * mass;
}

/**
 * Promień sferycznej orbity fotonowej w płaszczyźnie równikowej (Bardeen
 * 1972; Teo 2003): r̂_± = 2M[1+cos((2/3)arccos(∓a/M))]. sign=+1: prograde
 * (współbieżna ze spinem, r̂∈[M,3M]); sign=−1: retrograde (r̂∈[3M,4M]).
 */
export function kerrPhotonOrbitRadius(a: number, mass: number, sign: 1 | -1): number {
  const arg = sign === 1 ? -a / mass : a / mass;
  return 2 * mass * (1 + Math.cos((2 / 3) * Math.acos(Math.max(-1, Math.min(1, arg)))));
}

/** Krytyczny parametr zderzenia dla danej orbity fotonowej: b_± = ±3√(M r̂_±) − a. */
export function kerrCriticalImpactParameter(a: number, mass: number, sign: 1 | -1): number {
  const rHat = kerrPhotonOrbitRadius(a, mass, sign);
  return sign * 3 * Math.sqrt(mass * rHat) - a;
}

/**
 * Atraktor Lorenza (Lorenz 1963, J. Atmos. Sci. 20, 130) — uproszczony
 * model konwekcji atmosferycznej (3 zmienne zamiast pełnych równań
 * Naviera–Stokesa), pierwszy jawnie skonstruowany przykład chaosu
 * deterministycznego w układzie ciągłym. Równania:
 * dx/dt=σ(y−x), dy/dt=x(ρ−z)−y, dz/dt=xy−βz. Klasyczne parametry
 * σ=10, β=8/3 (Lorenz 1963); ρ steruje przejściem do chaosu.
 */
export interface LorenzState { x: number; y: number; z: number }

export function lorenzDerivative(s: LorenzState, sigma: number, rho: number, beta: number): LorenzState {
  return { x: sigma * (s.y - s.x), y: s.x * (rho - s.z) - s.y, z: s.x * s.y - beta * s.z };
}

/** Jeden krok RK4 (jak reszta całkowań w tym pliku — spójna metoda numeryczna w całym Genesis OS). */
export function stepLorenzRK4(s: LorenzState, dt: number, sigma: number, rho: number, beta: number): LorenzState {
  const add = (a: LorenzState, b: LorenzState, f: number): LorenzState => ({
    x: a.x + b.x * f, y: a.y + b.y * f, z: a.z + b.z * f,
  });
  const k1 = lorenzDerivative(s, sigma, rho, beta);
  const k2 = lorenzDerivative(add(s, k1, dt / 2), sigma, rho, beta);
  const k3 = lorenzDerivative(add(s, k2, dt / 2), sigma, rho, beta);
  const k4 = lorenzDerivative(add(s, k3, dt), sigma, rho, beta);
  return {
    x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: s.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  };
}

/**
 * Jednostki wygodne mechaniki nieba: odległość w AU, czas w latach, masa
 * w masach Słońca. Z trzeciego prawa Keplera dla Ziemi (a=1 AU, T=1 rok,
 * M=M_słońca) wynika DOKŁADNIE G=4π² w tych jednostkach — nie przybliżenie,
 * konsekwencja definicji jednostek (ten sam trik co gaussowska stała
 * grawitacji k, tylko w latach zamiast dniach).
 */
export const G_ASTRO_YEAR = 4 * Math.PI * Math.PI;
/** M_słońca / M_ziemi — stosunek mas (IAU). */
export const EARTH_MASSES_PER_SOLAR = 332946.0;

/** Prędkość z równania vis-viva: v²=μ(2/r−1/a), μ=G·M_centralna. */
export function visVivaSpeed(mu: number, r: number, semiMajorAxisAu: number): number {
  return Math.sqrt(mu * (2 / r - 1 / semiMajorAxisAu));
}

/**
 * Elementy oskulacyjne (a, e) z chwilowego wektora stanu (x,y,vx,vy) —
 * standardowa metoda energia+moment pędu z mechaniki nieba: ε=v²/2−μ/r
 * (energia właściwa) daje a=−μ/(2ε); h=x·vy−y·vx (moment pędu właściwy,
 * 2D) daje e=√(1−h²/(μa)). Używane do śledzenia dryfu orbity planety pod
 * wpływem prawdziwych zaburzeń grawitacyjnych innych ciał (nie z
 * wyidealizowanej, niezależnej elipsy Keplera).
 */
export function orbitalElementsFromState(
  x: number, y: number, vx: number, vy: number, mu: number,
): { semiMajorAxisAu: number; eccentricity: number } {
  const r = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - mu / r;
  const a = -mu / (2 * eps);
  const h = x * vy - y * vx;
  const e = Math.sqrt(Math.max(0, 1 - (h * h) / (mu * a)));
  return { semiMajorAxisAu: a, eccentricity: e };
}

/**
 * Próg homoklinicznego "wybuchu" chaosu (Sparrow 1982, "The Lorenz
 * Equations"): dla ρ poniżej tego progu dwa symetryczne punkty stałe
 * (poza początkiem układu) są stabilne; powyżej — powstaje chaotyczny
 * atraktor. Dla klasycznych σ=10, β=8/3 wynosi ≈24,74 (Lorenz użył ρ=28,
 * tuż powyżej progu).
 */
export function lorenzChaosThreshold(sigma: number, beta: number): number {
  return (sigma * (sigma + beta + 3)) / (sigma - beta - 1);
}

/**
 * Geometria 4D (hipersześcian/tesserakt) — CZYSTA algebra liniowa, dokładna
 * (nie model, nie przybliżenie). Nie jest to twierdzenie o istnieniu
 * fizycznych dodatkowych wymiarów przestrzennych (to osobna, spekulacyjna
 * kwestia teorii strun — patrz honestyNote eksperymentu, który z tego
 * korzysta) — wyłącznie standardowa matematyczna technika wizualizacji
 * obiektu 4D przez obrót w płaszczyźnie 4D i rzut perspektywiczny do 3D
 * (https://en.wikipedia.org/wiki/Tesseract, „Construction" i „Projections").
 */
export type Vec4 = [number, number, number, number];
export type Plane4D = 'xy' | 'xz' | 'xw' | 'yz' | 'yw' | 'zw';

/** Obrót o `angle` radianów w jednej z sześciu płaszczyzn 4D; pozostałe dwie współrzędne bez zmian. */
export function rotate4D(v: Vec4, plane: Plane4D, angle: number): Vec4 {
  const [x, y, z, w] = v;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  switch (plane) {
    case 'xy': return [x * c - y * s, x * s + y * c, z, w];
    case 'xz': return [x * c - z * s, y, x * s + z * c, w];
    case 'xw': return [x * c - w * s, y, z, x * s + w * c];
    case 'yz': return [x, y * c - z * s, y * s + z * c, w];
    case 'yw': return [x, y * c - w * s, z, y * s + w * c];
    case 'zw': return [x, y, z * c - w * s, z * s + w * c];
  }
}

/** Rzut perspektywiczny 4D→3D: dzielenie przez odległość wzdłuż osi w (ta sama technika co rzut 3D→2D w grafice komputerowej, o wymiar wyżej). */
export function project4Dto3D(v: Vec4, viewerDistance = 3): [number, number, number] {
  const [x, y, z, w] = v;
  const factor = viewerDistance / (viewerDistance - w);
  return [x * factor, y * factor, z * factor];
}

/** 16 wierzchołków tesseraktu: wszystkie kombinacje (±1,±1,±1,±1). */
export const TESSERACT_VERTICES: Vec4[] = Array.from({ length: 16 }, (_, i) => [
  i & 1 ? 1 : -1,
  i & 2 ? 1 : -1,
  i & 4 ? 1 : -1,
  i & 8 ? 1 : -1,
]);

/** 32 krawędzie: pary wierzchołków różniące się dokładnie jedną współrzędną (odległość Hamminga 1). */
export const TESSERACT_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit);
      if (j > i) edges.push([i, j]);
    }
  }
  return edges;
})();

/**
 * Polarność wiązania chemicznego z różnicy elektroujemności Paulinga
 * Δχ = |χA − χB|. Progi klasyfikacji (Δχ<0,4 kowalencyjne niespolaryzowane,
 * 0,4≤Δχ<1,7 kowalencyjne spolaryzowane, Δχ≥1,7 jonowe) to standardowa
 * konwencja dydaktyki chemii — orientacyjna, nie ostra granica fizyczna
 * (dlatego skewFraction jest funkcją CIĄGŁĄ Δχ, nie skokiem). Przybliżony
 * "procent charakteru jonowego" liczony wzorem Hanney–Smitha (1946):
 * f ≈ 1 − exp(−Δχ²/4) — klasyczne, wciąż cytowane oszacowanie.
 */
export type BondType = 'covalent-nonpolar' | 'covalent-polar' | 'ionic';

export interface BondPolarity {
  deltaChi: number;
  type: BondType;
  /** 0 = chmura elektronowa wyśrodkowana między atomami, 1 = elektron w pełni przeniesiony do bardziej elektroujemnego atomu. */
  skewFraction: number;
}

export function bondPolarity(chiA: number, chiB: number): BondPolarity {
  const deltaChi = Math.abs(chiA - chiB);
  const type: BondType = deltaChi < 0.4 ? 'covalent-nonpolar' : deltaChi < 1.7 ? 'covalent-polar' : 'ionic';
  const skewFraction = 1 - Math.exp(-(deltaChi * deltaChi) / 4);
  return { deltaChi, type, skewFraction };
}

/**
 * Krzywa rotacji galaktyki — najsilniejszy pojedynczy dowód obserwacyjny na
 * ciemną materię (Rubin, Ford & Thonnard 1978, 1980, ApJ). G w jednostkach
 * galaktycznych: kpc·(km/s)²/M_słońca (standardowa stała dynamiki galaktyk).
 */
export const G_ASTRO = 4.30091e-6; // kpc·(km/s)²/M_sun

/**
 * Masa zamknięta w promieniu r dla dysku wykładniczego (Freeman 1970):
 * Σ(r) = Σ0·exp(−r/rd). Uproszczenie: krążąca prędkość liczona jako gdyby
 * masa była rozłożona sferycznie symetrycznie (v=√(GM(<r)/r)) — NIE dokładne
 * rozwiązanie cienkiego dysku (które wymaga funkcji Bessela I0,I1,K0,K1),
 * ale standardowe przybliżenie dydaktyczne rzędu wielkości.
 */
export function exponentialDiskMass(r: number, diskMassTotal: number, scaleLength: number): number {
  if (r <= 0) return 0;
  const x = r / scaleLength;
  return diskMassTotal * (1 - (1 + x) * Math.exp(-x));
}

/**
 * Masa zamknięta w promieniu r dla pseudo-izotermicznej sfery ciemnej
 * materii, ρ(r) = ρ0/(1+(r/rc)²) — model Begemana (1989, A&A 223, 47,
 * "The rotation curve of NGC 6503") użyty do pierwszych ilościowych
 * dopasowań halo ciemnej materii. Przy r≫rc: M(r)∝r, więc v(r)→stała —
 * to właśnie ten mechanizm spłaszcza krzywą rotacji.
 */
export function isothermalHaloMass(r: number, rho0: number, coreRadius: number): number {
  if (r <= 0) return 0;
  return 4 * Math.PI * rho0 * coreRadius * coreRadius * (r - coreRadius * Math.atan(r / coreRadius));
}

/** Prędkość kołowa z masy zamkniętej w promieniu r (v²=GM(<r)/r). */
export function circularVelocity(enclosedMass: number, r: number): number {
  if (r <= 0) return 0;
  return Math.sqrt((G_ASTRO * enclosedMass) / r);
}

/**
 * MOND (Modified Newtonian Dynamics, Milgrom 1983, ApJ 270, 365) —
 * konkurencyjna hipoteza wobec ciemnej materii: przy bardzo małych
 * przyspieszeniach (a≪a0) efektywna grawitacja jest silniejsza niż
 * przewiduje Newton, bez dodawania nowej masy. "Prosta" funkcja
 * interpolująca μ(x)=x/(1+x) (Famaey & Binney 2005) daje zamknięty wzór:
 * g = [g_N + √(g_N² + 4·g_N·a0)] / 2. W granicy g_N≪a0 (daleki reżim MOND)
 * upraszcza się do g≈√(g_N·a0), co dla dysku o stałej masie M daje
 * ASYMPTOTYCZNIE PŁASKĄ prędkość v∞=(G·M·a0)^¼ — to relacja
 * Tully'ego–Fishera, dobrze potwierdzona empirycznie (★★★★), choć jej
 * interpretacja (nowa fizyka vs ciemna materia) pozostaje sporna.
 */
export const MOND_A0_ASTRO = 3703; // (km/s)²/kpc ≈ 1,2×10⁻¹⁰ m/s² (stała Milgroma)

export function mondAcceleration(newtonianAccel: number, a0: number = MOND_A0_ASTRO): number {
  if (newtonianAccel <= 0) return 0;
  return (newtonianAccel + Math.sqrt(newtonianAccel * newtonianAccel + 4 * newtonianAccel * a0)) / 2;
}

/**
 * Fala grawitacyjna z inspiralu podwójnego układu zwartego — formuła
 * kwadrupolowa wiodącego rzędu (ta sama metoda, którą LIGO użyło do
 * potwierdzenia GW150914: Abbott i in. 2016, Phys. Rev. Lett. 116, 061102,
 * Nagroda Nobla 2017 dla Weissa, Thorne'a i Barisha). Model jest ważny
 * TYLKO we wczesnym inspiralu (separacja ≫ promień Schwarzschilda) —
 * blisko połączenia potrzebna jest pełna relatywistyka numeryczna (NR),
 * dlatego funkcje poniżej kończą swój zakres na promieniu ISCO i NIE
 * próbują modelować samego połączenia ani "ringdown".
 */
const G_SI = 6.674e-11; // m³ kg⁻¹ s⁻²
const C_SI = 2.998e8; // m/s
const M_SUN_KG = 1.989e30;

/** Masa ćwierkowa (chirp mass) w masach Słońca: ℳ = (m₁m₂)^⅗/(m₁+m₂)^⅕. */
export function chirpMassSolar(m1Solar: number, m2Solar: number): number {
  return Math.pow(m1Solar * m2Solar, 3 / 5) / Math.pow(m1Solar + m2Solar, 1 / 5);
}

/** Czas do połączenia [s] przy danej częstotliwości fali f [Hz] (formuła kwadrupolowa). */
export function timeToMerger(chirpMassSolarVal: number, freqHz: number): number {
  const GMc3 = (G_SI * chirpMassSolarVal * M_SUN_KG) / Math.pow(C_SI, 3);
  return (5 / 256) * Math.pow(GMc3, -5 / 3) * Math.pow(Math.PI * freqHz, -8 / 3);
}

/** Częstotliwość fali grawitacyjnej [Hz] τ sekund przed połączeniem (odwrotność timeToMerger). */
export function chirpFrequency(chirpMassSolarVal: number, tauSeconds: number): number {
  if (tauSeconds <= 0) return Infinity;
  const GMc3 = (G_SI * chirpMassSolarVal * M_SUN_KG) / Math.pow(C_SI, 3);
  return (1 / Math.PI) * Math.pow(5 / (256 * tauSeconds), 3 / 8) * Math.pow(GMc3, -5 / 8);
}

/** Częstotliwość ISCO (innermost stable circular orbit, Schwarzschild r=6GM/c²) — granica ważności modelu inspiralu. */
export function iscoFrequency(totalMassSolar: number): number {
  const M_kg = totalMassSolar * M_SUN_KG;
  return Math.pow(C_SI, 3) / (Math.pow(6, 1.5) * Math.PI * G_SI * M_kg);
}

/** Separacja orbitalna [m] przy danej częstotliwości fali (relacja Keplera, f_GW = 2·f_orb, ω_orb = π·f_GW). */
export function binarySeparationMeters(totalMassSolar: number, freqHz: number): number {
  const M_kg = totalMassSolar * M_SUN_KG;
  const omega = Math.PI * freqHz;
  return Math.cbrt((G_SI * M_kg) / (omega * omega));
}

/**
 * Miareczkowanie słabego kwasu mocną zasadą — DOKŁADNE równanie bilansu
 * ładunku (nie tylko przybliżenie Hendersona–Hasselbalcha, które zawodzi
 * blisko początku i punktu równoważnikowego). Bilans ładunku:
 * [Na⁺] + [H⁺] = [A⁻] + [OH⁻], z [A⁻] = C_a·Ka/(Ka+[H⁺]) (bilans masy +
 * stała dysocjacji) i [OH⁻] = Kw/[H⁺] (autodysocjacja wody — bez tego
 * krzywa byłaby błędna blisko pH=7). Rozwiązywane bisekcją w skali
 * logarytmicznej stężenia [H⁺] (funkcja bilansu jest ściśle monotoniczna
 * w [H⁺], więc bisekcja ZAWSZE zbiega do jedynego pierwiastka).
 */
export function titrationPH(
  acidConcM: number,
  acidVolMl: number,
  baseConcM: number,
  baseVolMl: number,
  ka: number,
  kw = 1e-14,
): number {
  const vTotal = acidVolMl + baseVolMl;
  const caTotal = (acidConcM * acidVolMl) / vTotal;
  const cbTotal = (baseConcM * baseVolMl) / vTotal;
  const balance = (h: number) => cbTotal + h - (caTotal * ka) / (ka + h) - kw / h;
  let lo = 1e-14;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (balance(mid) < 0) lo = mid;
    else hi = mid;
  }
  return -Math.log10(Math.sqrt(lo * hi));
}

/** Objętość zasady [mL] w punkcie równoważnikowym miareczkowania: C_a·V_a = C_b·V_eq. */
export function equivalenceVolumeMl(acidConcM: number, acidVolMl: number, baseConcM: number): number {
  return (acidConcM * acidVolMl) / baseConcM;
}

/** Gęstość prawdopodobieństwa rozkładu normalnego N(mean, sigma²) — standardowy wzór statystyczny. */
export function gaussianPdf(x: number, mean: number, sigma: number): number {
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / sigma) ** 2);
}

/**
 * "Napięcie" między dwoma niezależnymi pomiarami tej samej wielkości, w
 * jednostkach łącznego odchylenia standardowego (niepewności kombinowane w
 * kwadraturze — standardowa metoda w fizyce doświadczalnej). Używane m.in.
 * do oceny "napięcia Hubble'a" (SH0ES vs Planck CMB) — realny, aktywny spór
 * kosmologiczny, patrz `knowledge/universe.md`.
 */
export function measurementTensionSigma(mean1: number, sigma1: number, mean2: number, sigma2: number): number {
  return Math.abs(mean1 - mean2) / Math.sqrt(sigma1 * sigma1 + sigma2 * sigma2);
}

/**
 * Temperatura topnienia krótkiego DNA — reguła Wallace'a ("2+4"): Tm =
 * 2°C·(liczba A+T) + 4°C·(liczba G+C) (Wallace i in. 1979, Nucleic Acids
 * Res. 6, 3543). Empiryczna, ale powszechnie używana przybliżenie dla
 * krótkich oligonukleotydów (<14 zasad) — dokładniejsze metody (najbliższy
 * sąsiad) wymagają tablic termodynamicznych, świadomie pominiętych tutaj.
 */
export function dnaMeltingTempWallace(sequence: string): number {
  let atCount = 0;
  let gcCount = 0;
  for (const base of sequence.toUpperCase()) {
    if (base === 'A' || base === 'T') atCount++;
    else if (base === 'G' || base === 'C') gcCount++;
  }
  return 2 * atCount + 4 * gcCount;
}

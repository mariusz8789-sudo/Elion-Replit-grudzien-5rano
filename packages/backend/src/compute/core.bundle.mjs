// packages/frontend/src/core/physics.ts
function lorentzGamma(beta) {
  return 1 / Math.sqrt(1 - beta * beta);
}
function lorentzTime(ct, x, beta) {
  return lorentzGamma(beta) * (ct - beta * x);
}
function lensImagePositions(beta) {
  const d = Math.sqrt(beta * beta + 4);
  return [0.5 * (beta + d), 0.5 * (beta - d)];
}
function lensAmplification(u) {
  const uu = Math.max(u, 1e-9);
  return (uu * uu + 2) / (uu * Math.sqrt(uu * uu + 4));
}
function decayRemaining(halfLives) {
  return Math.pow(0.5, halfLives);
}
function kardashevPower(K) {
  return Math.pow(10, 10 * K + 6);
}
function schwarzschildRadius(massKg) {
  const G2 = 6674e-14;
  const C = 2998e5;
  return 2 * G2 * massKg / (C * C);
}
function singletCorrelation(a, b) {
  return -Math.cos(a - b);
}
function chshS(E, a, aP, b, bP) {
  return E(a, b) - E(a, bP) + E(aP, b) + E(aP, bP);
}
function sampleSingletPair(a, b, rnd = Math.random) {
  const A = rnd() < 0.5 ? 1 : -1;
  const pSame = (1 + singletCorrelation(a, b)) / 2;
  const B = rnd() < pSame ? A : -A;
  return [A, B];
}
function sampleLocalHiddenPair(a, b, rnd = Math.random) {
  const lambda = rnd() * Math.PI * 2;
  const sign = (x) => Math.cos(x) >= 0 ? 1 : -1;
  return [sign(a - lambda), -sign(b - lambda)];
}
function solveKepler(meanAnomaly, e) {
  let E = meanAnomaly;
  for (let i = 0; i < 8; i++) {
    E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
  }
  return E;
}
function keplerPosition(semiMajorAxisAu, eccentricity, meanAnomaly) {
  const E = solveKepler(meanAnomaly, eccentricity);
  return {
    x: semiMajorAxisAu * (Math.cos(E) - eccentricity),
    y: semiMajorAxisAu * Math.sqrt(1 - eccentricity ** 2) * Math.sin(E)
  };
}
var SEMF_A_V = 15.8;
var SEMF_A_S = 17.8;
var SEMF_A_C = 0.711;
var SEMF_A_A = 23.7;
var SEMF_DELTA = 11.18;
function semfBindingEnergy(z, n) {
  const a = z + n;
  if (a <= 0 || z < 0 || n < 0) return 0;
  const volume = SEMF_A_V * a;
  const surface = SEMF_A_S * Math.pow(a, 2 / 3);
  const coulomb = SEMF_A_C * z * (z - 1) / Math.pow(a, 1 / 3);
  const asymmetry = SEMF_A_A * (a - 2 * z) ** 2 / a;
  const evenZ = z % 2 === 0;
  const evenN = n % 2 === 0;
  const pairing = evenZ && evenN ? SEMF_DELTA / Math.sqrt(a) : !evenZ && !evenN ? -SEMF_DELTA / Math.sqrt(a) : 0;
  return volume - surface - coulomb - asymmetry + pairing;
}
function semfBindingPerNucleon(z, n) {
  const a = z + n;
  return a > 0 ? semfBindingEnergy(z, n) / a : 0;
}
function semfStabilityGradient(z, n) {
  const up = z + 1 >= 1 && n - 1 >= 0 ? semfBindingEnergy(z + 1, n - 1) : -Infinity;
  const down = z - 1 >= 0 && n + 1 >= 0 ? semfBindingEnergy(z - 1, n + 1) : -Infinity;
  const here = semfBindingEnergy(z, n);
  return Math.max(up - here, 0) - Math.max(down - here, 0);
}
function schwarzschildGeodesicRHS(u, rsUnits) {
  return -u + 1.5 * rsUnits * u * u;
}
var SCHWARZSCHILD_CRITICAL_IMPACT = 3 * Math.sqrt(3) / 2;
function stepSchwarzschildGeodesic(u, du, dphi, rsUnits) {
  const f = (uu) => schwarzschildGeodesicRHS(uu, rsUnits);
  const k1u = du;
  const k1d = f(u);
  const k2u = du + 0.5 * dphi * k1d;
  const k2d = f(u + 0.5 * dphi * k1u);
  const k3u = du + 0.5 * dphi * k2d;
  const k3d = f(u + 0.5 * dphi * k2u);
  const k4u = du + dphi * k3d;
  const k4d = f(u + dphi * k3u);
  return {
    u: u + dphi / 6 * (k1u + 2 * k2u + 2 * k3u + k4u),
    du: du + dphi / 6 * (k1d + 2 * k2d + 2 * k3d + k4d)
  };
}
function kerrQ(u, a, b, mass) {
  return 1 + (a * a - b * b) * u * u + 2 * mass * (b - a) ** 2 * u ** 3;
}
function kerrDeltaTilde(u, a, mass) {
  return 1 - 2 * mass * u + a * a * u * u;
}
function kerrEquatorialF(u, a, b, mass) {
  const deltaTilde = kerrDeltaTilde(u, a, mass);
  const n = b - 2 * mass * u * (b - a);
  if (n === 0) return 0;
  return kerrQ(u, a, b, mass) * deltaTilde * deltaTilde / (n * n);
}
function kerrFPrime(u, a, b, mass) {
  const h = 1e-6;
  const fm2 = kerrEquatorialF(u - 2 * h, a, b, mass);
  const fm1 = kerrEquatorialF(u - h, a, b, mass);
  const fp1 = kerrEquatorialF(u + h, a, b, mass);
  const fp2 = kerrEquatorialF(u + 2 * h, a, b, mass);
  return (fm2 - 8 * fm1 + 8 * fp1 - fp2) / (12 * h);
}
function kerrEquatorialRHS(u, a, b, mass) {
  return kerrFPrime(u, a, b, mass) / 2;
}
function stepKerrEquatorialGeodesic(u, du, dphi, a, b, mass) {
  const f = (uu) => kerrEquatorialRHS(uu, a, b, mass);
  const k1u = du;
  const k1d = f(u);
  const k2u = du + 0.5 * dphi * k1d;
  const k2d = f(u + 0.5 * dphi * k1u);
  const k3u = du + 0.5 * dphi * k2d;
  const k3d = f(u + 0.5 * dphi * k2u);
  const k4u = du + dphi * k3d;
  const k4d = f(u + dphi * k3u);
  return {
    u: u + dphi / 6 * (k1u + 2 * k2u + 2 * k3u + k4u),
    du: du + dphi / 6 * (k1d + 2 * k2d + 2 * k3d + k4d)
  };
}
function kerrHorizonRadius(a, mass) {
  return mass + Math.sqrt(Math.max(0, mass * mass - a * a));
}
function kerrErgosphereEquatorRadius(mass) {
  return 2 * mass;
}
function kerrPhotonOrbitRadius(a, mass, sign) {
  const arg = sign === 1 ? -a / mass : a / mass;
  return 2 * mass * (1 + Math.cos(2 / 3 * Math.acos(Math.max(-1, Math.min(1, arg)))));
}
function kerrCriticalImpactParameter(a, mass, sign) {
  const rHat = kerrPhotonOrbitRadius(a, mass, sign);
  return sign * 3 * Math.sqrt(mass * rHat) - a;
}
function lorenzDerivative(s, sigma, rho, beta) {
  return { x: sigma * (s.y - s.x), y: s.x * (rho - s.z) - s.y, z: s.x * s.y - beta * s.z };
}
function stepLorenzRK4(s, dt, sigma, rho, beta) {
  const add = (a, b, f) => ({
    x: a.x + b.x * f,
    y: a.y + b.y * f,
    z: a.z + b.z * f
  });
  const k1 = lorenzDerivative(s, sigma, rho, beta);
  const k2 = lorenzDerivative(add(s, k1, dt / 2), sigma, rho, beta);
  const k3 = lorenzDerivative(add(s, k2, dt / 2), sigma, rho, beta);
  const k4 = lorenzDerivative(add(s, k3, dt), sigma, rho, beta);
  return {
    x: s.x + dt / 6 * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + dt / 6 * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: s.z + dt / 6 * (k1.z + 2 * k2.z + 2 * k3.z + k4.z)
  };
}
var G_ASTRO_YEAR = 4 * Math.PI * Math.PI;
var EARTH_MASSES_PER_SOLAR = 332946;
function visVivaSpeed(mu, r, semiMajorAxisAu) {
  return Math.sqrt(mu * (2 / r - 1 / semiMajorAxisAu));
}
function orbitalElementsFromState(x, y, vx, vy, mu) {
  const r = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - mu / r;
  const a = -mu / (2 * eps);
  const h = x * vy - y * vx;
  const e = Math.sqrt(Math.max(0, 1 - h * h / (mu * a)));
  return { semiMajorAxisAu: a, eccentricity: e };
}
function lorenzChaosThreshold(sigma, beta) {
  return sigma * (sigma + beta + 3) / (sigma - beta - 1);
}
function rotate4D(v, plane, angle) {
  const [x, y, z, w] = v;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  switch (plane) {
    case "xy":
      return [x * c - y * s, x * s + y * c, z, w];
    case "xz":
      return [x * c - z * s, y, x * s + z * c, w];
    case "xw":
      return [x * c - w * s, y, z, x * s + w * c];
    case "yz":
      return [x, y * c - z * s, y * s + z * c, w];
    case "yw":
      return [x, y * c - w * s, z, y * s + w * c];
    case "zw":
      return [x, y, z * c - w * s, z * s + w * c];
  }
}
function project4Dto3D(v, viewerDistance = 3) {
  const [x, y, z, w] = v;
  const factor = viewerDistance / (viewerDistance - w);
  return [x * factor, y * factor, z * factor];
}
var TESSERACT_VERTICES = Array.from({ length: 16 }, (_, i) => [
  i & 1 ? 1 : -1,
  i & 2 ? 1 : -1,
  i & 4 ? 1 : -1,
  i & 8 ? 1 : -1
]);
var TESSERACT_EDGES = (() => {
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ 1 << bit;
      if (j > i) edges.push([i, j]);
    }
  }
  return edges;
})();
function bondPolarity(chiA, chiB) {
  const deltaChi = Math.abs(chiA - chiB);
  const type = deltaChi < 0.4 ? "covalent-nonpolar" : deltaChi < 1.7 ? "covalent-polar" : "ionic";
  const skewFraction = 1 - Math.exp(-(deltaChi * deltaChi) / 4);
  return { deltaChi, type, skewFraction };
}
var G_ASTRO = 430091e-11;
function exponentialDiskMass(r, diskMassTotal, scaleLength) {
  if (r <= 0) return 0;
  const x = r / scaleLength;
  return diskMassTotal * (1 - (1 + x) * Math.exp(-x));
}
function isothermalHaloMass(r, rho0, coreRadius) {
  if (r <= 0) return 0;
  return 4 * Math.PI * rho0 * coreRadius * coreRadius * (r - coreRadius * Math.atan(r / coreRadius));
}
function circularVelocity(enclosedMass, r) {
  if (r <= 0) return 0;
  return Math.sqrt(G_ASTRO * enclosedMass / r);
}
var MOND_A0_ASTRO = 3703;
function mondAcceleration(newtonianAccel, a0 = MOND_A0_ASTRO) {
  if (newtonianAccel <= 0) return 0;
  return (newtonianAccel + Math.sqrt(newtonianAccel * newtonianAccel + 4 * newtonianAccel * a0)) / 2;
}
var G_SI = 6674e-14;
var C_SI = 2998e5;
var M_SUN_KG = 1989e27;
function chirpMassSolar(m1Solar, m2Solar) {
  return Math.pow(m1Solar * m2Solar, 3 / 5) / Math.pow(m1Solar + m2Solar, 1 / 5);
}
function timeToMerger(chirpMassSolarVal, freqHz) {
  const GMc3 = G_SI * chirpMassSolarVal * M_SUN_KG / Math.pow(C_SI, 3);
  return 5 / 256 * Math.pow(GMc3, -5 / 3) * Math.pow(Math.PI * freqHz, -8 / 3);
}
function chirpFrequency(chirpMassSolarVal, tauSeconds) {
  if (tauSeconds <= 0) return Infinity;
  const GMc3 = G_SI * chirpMassSolarVal * M_SUN_KG / Math.pow(C_SI, 3);
  return 1 / Math.PI * Math.pow(5 / (256 * tauSeconds), 3 / 8) * Math.pow(GMc3, -5 / 8);
}
function iscoFrequency(totalMassSolar) {
  const M_kg = totalMassSolar * M_SUN_KG;
  return Math.pow(C_SI, 3) / (Math.pow(6, 1.5) * Math.PI * G_SI * M_kg);
}
function binarySeparationMeters(totalMassSolar, freqHz) {
  const M_kg = totalMassSolar * M_SUN_KG;
  const omega = Math.PI * freqHz;
  return Math.cbrt(G_SI * M_kg / (omega * omega));
}
function titrationPH(acidConcM, acidVolMl, baseConcM, baseVolMl, ka, kw = 1e-14) {
  const vTotal = acidVolMl + baseVolMl;
  const caTotal = acidConcM * acidVolMl / vTotal;
  const cbTotal = baseConcM * baseVolMl / vTotal;
  const balance = (h) => cbTotal + h - caTotal * ka / (ka + h) - kw / h;
  let lo = 1e-14;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (balance(mid) < 0) lo = mid;
    else hi = mid;
  }
  return -Math.log10(Math.sqrt(lo * hi));
}
function equivalenceVolumeMl(acidConcM, acidVolMl, baseConcM) {
  return acidConcM * acidVolMl / baseConcM;
}
function gaussianPdf(x, mean, sigma) {
  return 1 / (sigma * Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * ((x - mean) / sigma) ** 2);
}
function measurementTensionSigma(mean1, sigma1, mean2, sigma2) {
  return Math.abs(mean1 - mean2) / Math.sqrt(sigma1 * sigma1 + sigma2 * sigma2);
}
function dnaMeltingTempWallace(sequence) {
  let atCount = 0;
  let gcCount = 0;
  for (const base of sequence.toUpperCase()) {
    if (base === "A" || base === "T") atCount++;
    else if (base === "G" || base === "C") gcCount++;
  }
  return 2 * atCount + 4 * gcCount;
}

// packages/frontend/src/core/modelGraph/graph.ts
var ModelGraph = class {
  nodes = /* @__PURE__ */ new Map();
  values = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  /**
   * Dodaje węzeł do grafu. `inputs` może odwoływać się WYŁĄCZNIE do węzłów
   * dodanych wcześniej — graf jest więc DAG-iem z konstrukcji (append-only:
   * nowy węzeł nigdy nie istnieje w chwili, gdy sprawdzane są jego własne
   * wejścia, więc cykl — łącznie z samo-odwołaniem — jest strukturalnie
   * niemożliwy do zbudowania tym API, nie tylko wykrywany po fakcie).
   */
  addNode(def, initialValue = 0) {
    if (this.nodes.has(def.id)) throw new Error(`W\u0119ze\u0142 \u201E${def.id}" ju\u017C istnieje w Scientific Model Graph`);
    for (const inputId of def.inputs) {
      if (!this.nodes.has(inputId)) {
        throw new Error(`W\u0119ze\u0142 \u201E${def.id}" zale\u017Cy od nieistniej\u0105cego w\u0119z\u0142a \u201E${inputId}" \u2014 dodaj go najpierw`);
      }
    }
    this.nodes.set(def.id, def);
    this.values.set(def.id, def.inputs.length === 0 ? initialValue : def.compute(this.collectInputs(def)));
  }
  collectInputs(def) {
    const out = {};
    for (const id of def.inputs) out[id] = this.values.get(id);
    return out;
  }
  getNode(id) {
    return this.nodes.get(id);
  }
  getAllNodes() {
    return [...this.nodes.values()];
  }
  /** Id wszystkich węzłów-parametrów (korzeni, inputs=[]) — to, co gałąź rzeczywistości może migawkować/nadpisywać. */
  getParameterNodeIds() {
    return [...this.nodes.values()].filter((n) => n.inputs.length === 0).map((n) => n.id);
  }
  /** Migawka BIEŻĄCYCH wartości wszystkich węzłów-parametrów — podstawa gałęzi rzeczywistości (patrz core/reality/branches.ts). */
  getParameterSnapshot() {
    const out = {};
    for (const id of this.getParameterNodeIds()) out[id] = this.values.get(id);
    return out;
  }
  getValue(id) {
    const v = this.values.get(id);
    if (v === void 0) throw new Error(`Nieznany w\u0119ze\u0142 \u201E${id}"`);
    return v;
  }
  /** Wszyscy potomkowie (bezpośredni i pośredni) węzłów z `rootIds` — wyznacza, co w ogóle MOŻE zmienić się w wyniku edycji tych parametrów. */
  descendantsOf(rootIds) {
    const desc = /* @__PURE__ */ new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, def] of this.nodes) {
        if (desc.has(id)) continue;
        if (def.inputs.some((i) => rootIds.includes(i) || desc.has(i))) {
          desc.add(id);
          changed = true;
        }
      }
    }
    return desc;
  }
  /** Zwraca id węzłów z `ids` w PRAWDZIWEJ kolejności topologicznej obliczeń (nie w kolejności dodania do grafu). */
  topoOrderOf(ids) {
    const inDegree = /* @__PURE__ */ new Map();
    for (const id of ids) {
      const def = this.nodes.get(id);
      inDegree.set(id, def.inputs.filter((i) => ids.has(i)).length);
    }
    const queue = [...ids].filter((id) => inDegree.get(id) === 0);
    const order = [];
    while (queue.length > 0) {
      const id = queue.shift();
      order.push(id);
      for (const otherId of ids) {
        const def = this.nodes.get(otherId);
        if (!def.inputs.includes(id)) continue;
        const remaining = (inDegree.get(otherId) ?? 0) - 1;
        inDegree.set(otherId, remaining);
        if (remaining === 0) queue.push(otherId);
      }
    }
    return order;
  }
  /**
   * Wspólny silnik propagacji dla setParameter() i applyParameterSnapshot():
   * `changes` to już ZASTOSOWANE nowe wartości korzeni (this.values zaktualizowane
   * przed wywołaniem). Liczy potomków WSZYSTKICH zmienionych korzeni RAZEM w
   * jednej partii (jeden spójny porządek topologiczny), więc węzeł zależny od
   * dwóch zmienionych parametrów przelicza się DOKŁADNIE RAZ, nie dwa razy z
   * niespójnym stanem pośrednim.
   */
  propagate(changedRootIds, rootSteps) {
    const steps = [...rootSteps];
    const changedThisBatch = new Set(changedRootIds);
    const descendants = this.descendantsOf(changedRootIds);
    for (const nodeId of this.topoOrderOf(descendants)) {
      const nodeDef = this.nodes.get(nodeId);
      const prev = this.values.get(nodeId);
      const next = nodeDef.compute(this.collectInputs(nodeDef));
      this.values.set(nodeId, next);
      if (next !== prev) {
        const causedBy = nodeDef.inputs.filter((i) => changedThisBatch.has(i));
        steps.push({ nodeId, value: next, previousValue: prev, causedBy });
        changedThisBatch.add(nodeId);
      }
    }
    if (steps.length > 0) for (const listener of this.listeners) listener(steps);
    return steps;
  }
  /**
   * Ustawia wartość węzła-parametru (musi mieć inputs=[]) i propaguje zmianę
   * do wszystkich potomków w PRAWDZIWEJ kolejności zależności. Zwraca listę
   * kroków — to jest dokładnie to, co Reality Navigator odtwarza jako
   * "widoczną konsekwencję", węzeł po węźle, w kolejności, w jakiej naprawdę
   * zostały przeliczone.
   */
  setParameter(id, value) {
    const def = this.nodes.get(id);
    if (!def) throw new Error(`Nieznany w\u0119ze\u0142 \u201E${id}"`);
    if (def.inputs.length > 0) throw new Error(`W\u0119ze\u0142 \u201E${id}" nie jest parametrem (ma zale\u017Cno\u015Bci) \u2014 nie mo\u017Cna go ustawi\u0107 bezpo\u015Brednio`);
    const previousValue = this.values.get(id);
    this.values.set(id, value);
    const rootSteps = value !== previousValue ? [{ nodeId: id, value, previousValue, causedBy: [] }] : [];
    if (rootSteps.length === 0) return [];
    return this.propagate([id], rootSteps);
  }
  /**
   * Ustawia WIELE parametrów naraz (np. przywrócenie gałęzi rzeczywistości z
   * kilkoma zmienionymi wartościami) i propaguje w JEDNEJ spójnej partii —
   * patrz propagate(). Nieznane/nie-parametrowe klucze w `values` są pomijane
   * po cichu (branchStore może przechowywać klucze z grafów, których ten
   * konkretny wywołujący nie zna).
   */
  applyParameterSnapshot(values) {
    const changedRootIds = [];
    const rootSteps = [];
    for (const [id, value] of Object.entries(values)) {
      const def = this.nodes.get(id);
      if (!def || def.inputs.length > 0) continue;
      const previousValue = this.values.get(id);
      if (value === previousValue) continue;
      this.values.set(id, value);
      changedRootIds.push(id);
      rootSteps.push({ nodeId: id, value, previousValue, causedBy: [] });
    }
    if (changedRootIds.length === 0) return [];
    return this.propagate(changedRootIds, rootSteps);
  }
  /** Powiadamiane po każdym setParameter()/applyParameterSnapshot() z niepustą listą kroków — Reality Navigator używa tego do napędzania kamery/UI, nie do udawania fizyki. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
};

// packages/frontend/src/core/modelGraph/nuclearGraph.ts
var BASELINE_Z = 26;
var BASELINE_N = 30;
function buildNuclearModelGraph() {
  const graph = new ModelGraph();
  graph.addNode(
    {
      id: "protonNumber",
      label: "Liczba proton\xF3w Z",
      unit: "",
      domain: "fizyka j\u0105drowa",
      honesty: "exact",
      honestyNote: "Parametr wej\u015Bciowy (liczba atomowa) \u2014 definiuje pierwiastek. Ustawiany bezpo\u015Brednio.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.protonNumber ?? BASELINE_Z,
      formula: "Z (parametr)"
    },
    BASELINE_Z
  );
  graph.addNode(
    {
      id: "neutronNumber",
      label: "Liczba neutron\xF3w N",
      unit: "",
      domain: "fizyka j\u0105drowa",
      honesty: "exact",
      honestyNote: "Parametr wej\u015Bciowy \u2014 definiuje izotop przy danym Z. Ustawiany bezpo\u015Brednio.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.neutronNumber ?? BASELINE_N,
      formula: "N (parametr)"
    },
    BASELINE_N
  );
  graph.addNode({
    id: "massNumber",
    label: "Liczba masowa A",
    unit: "nukleon\xF3w",
    domain: "fizyka j\u0105drowa",
    honesty: "exact",
    honestyNote: "A = Z + N \u2014 dok\u0142adna arytmetyka, zale\u017Cy od OBU parametr\xF3w jednocze\u015Bnie.",
    derivation: "direct",
    inputs: ["protonNumber", "neutronNumber"],
    compute: (i) => i.protonNumber + i.neutronNumber,
    formula: "A = Z + N"
  });
  graph.addNode({
    id: "bindingEnergy",
    label: "Energia wi\u0105zania j\u0105dra",
    unit: "MeV",
    domain: "fizyka j\u0105drowa",
    honesty: "exact",
    honestyNote: 'P\xF3\u0142empiryczny wz\xF3r SEMF (Weizs\xE4cker): B = a_V\xB7A \u2212 a_S\xB7A^\u2154 \u2212 a_C\xB7Z(Z\u22121)/A^\u2153 \u2212 a_A\xB7(A\u22122Z)\xB2/A \xB1 \u03B4. To ZNANY, standardowy wz\xF3r (st\u0105d HonestyLevel \u201Eexact"), ale sam jest MODELEM przybli\u017Caj\u0105cym \u2014 pomija efekty pow\u0142okowe, wi\u0119c odbiega od zmierzonych mas przy liczbach magicznych (st\u0105d derivation \u201Eapproximate"). Ta sama funkcja core/physics.ts::semfBindingEnergy co Nuclear Lab.',
    derivation: "approximate",
    inputs: ["protonNumber", "neutronNumber"],
    compute: (i) => semfBindingEnergy(i.protonNumber, i.neutronNumber),
    formula: "B = a_V\xB7A \u2212 a_S\xB7A^\u2154 \u2212 a_C\xB7Z(Z\u22121)/A^\u2153 \u2212 a_A\xB7(A\u22122Z)\xB2/A \xB1 \u03B4"
  });
  graph.addNode({
    id: "bindingPerNucleon",
    label: "Energia wi\u0105zania na nukleon",
    unit: "MeV/nukleon",
    domain: "fizyka j\u0105drowa",
    honesty: "exact",
    honestyNote: 'B/A \u2014 miara \u201Ejak mocno zwi\u0105zane" jest j\u0105dro; szczyt (~8,8 MeV) wyznacza granic\u0119 mi\u0119dzy zyskiem z fuzji (lekkie j\u0105dra) a rozszczepienia (ci\u0119\u017Ckie). Dok\u0142adny iloraz z B i A, ale dziedziczy przybli\u017Cenie SEMF z w\u0119z\u0142a bindingEnergy. Ta sama funkcja core/physics.ts::semfBindingPerNucleon co dolina stabilno\u015Bci 3D.',
    derivation: "approximate",
    inputs: ["protonNumber", "neutronNumber"],
    compute: (i) => semfBindingPerNucleon(i.protonNumber, i.neutronNumber),
    formula: "B/A"
  });
  graph.addNode({
    id: "stabilityGradient",
    label: "Gradient stabilno\u015Bci (kierunek rozpadu \u03B2)",
    unit: "MeV",
    domain: "fizyka j\u0105drowa",
    honesty: "exact",
    honestyNote: "R\xF3\u017Cnica energii wi\u0105zania s\u0105siednich izobar\xF3w przy sta\u0142ym A: dodatnia \u2192 faworyzuje \u03B2\u207B (n\u2192p), ujemna \u2192 \u03B2\u207A/EC (p\u2192n), zero w dolinie stabilno\u015Bci. Wyprowadzone z SEMF, wi\u0119c przybli\u017Cone (nie przewiduje p\xF3\u0142okres\xF3w, tylko kierunek). Ta sama funkcja core/physics.ts::semfStabilityGradient.",
    derivation: "approximate",
    inputs: ["protonNumber", "neutronNumber"],
    compute: (i) => semfStabilityGradient(i.protonNumber, i.neutronNumber),
    formula: "\u0394B mi\u0119dzy izobarami (Z\xB11, N\u22131)"
  });
  return graph;
}

// packages/frontend/src/core/modelGraph/bohrModelGraph.ts
var RYDBERG_EV = 13.605693;
var BOHR_RADIUS_PM = 52.917721;
var BASELINE_Z2 = 1;
var BASELINE_N2 = 2;
function buildBohrModelGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "atomicNumber",
      label: "Liczba atomowa Z",
      unit: "",
      domain: "model atomu (Bohr)",
      honesty: "exact",
      honestyNote: "\u0141adunek j\u0105dra (H=1, He\u207A=2\u2026). Model Bohra jest \u015Bcis\u0142y tylko dla JEDNEGO elektronu.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.atomicNumber ?? BASELINE_Z2,
      formula: "Z (parametr)"
    },
    BASELINE_Z2
  );
  g.addNode(
    {
      id: "principalN",
      label: "G\u0142\xF3wna liczba kwantowa n",
      unit: "",
      domain: "model atomu (Bohr)",
      honesty: "exact",
      honestyNote: "Numer pow\u0142oki (n = 1, 2, 3\u2026) \u2014 zadany.",
      derivation: "direct",
      inputs: [],
      compute: (i) => Math.max(1, Math.round(i.principalN ?? BASELINE_N2)),
      formula: "n (parametr)"
    },
    BASELINE_N2
  );
  g.addNode({
    id: "energyLevelEV",
    label: "Energia poziomu E_n",
    unit: "eV",
    domain: "model atomu (Bohr)",
    honesty: "simplified",
    honestyNote: "E_n = \u221213,606\xB7Z\xB2/n\xB2 eV. PRZYBLI\u017BONE: dok\u0142adne dla uk\u0142ad\xF3w jednoelektronowych; dla atom\xF3w wieloelektronowych ekranowanie i odpychanie \u0142ami\u0105 t\u0119 prost\u0105 zale\u017Cno\u015B\u0107.",
    derivation: "approximate",
    inputs: ["atomicNumber", "principalN"],
    compute: (i) => -RYDBERG_EV * (i.atomicNumber * i.atomicNumber) / (i.principalN * i.principalN),
    formula: "E_n = \u221213,606\xB7Z\xB2/n\xB2"
  });
  g.addNode({
    id: "orbitalRadiusPm",
    label: "Promie\u0144 orbity r_n",
    unit: "pm",
    domain: "model atomu (Bohr)",
    honesty: "simplified",
    honestyNote: "r_n = 52,9\xB7n\xB2/Z pm (promie\u0144 Bohra). PRZYBLI\u017BONE \u2014 model ko\u0142owych orbit; mechanika kwantowa zast\u0119puje je rozk\u0142adem prawdopodobie\u0144stwa (orbitalami).",
    derivation: "approximate",
    inputs: ["principalN", "atomicNumber"],
    compute: (i) => BOHR_RADIUS_PM * (i.principalN * i.principalN) / i.atomicNumber,
    formula: "r_n = 52,9\xB7n\xB2/Z"
  });
  g.addNode({
    id: "ionizationPhotonEV",
    label: "Energia jonizacji z poziomu n",
    unit: "eV",
    domain: "model atomu (Bohr)",
    honesty: "simplified",
    honestyNote: "E_jon = \u2212E_n = 13,606\xB7Z\xB2/n\xB2 eV \u2014 energia potrzebna, by usun\u0105\u0107 elektron z poziomu n do niesko\u0144czono\u015Bci. Dla H, n=1 daje 13,6 eV. \u2713",
    derivation: "approximate",
    inputs: ["energyLevelEV"],
    compute: (i) => -i.energyLevelEV,
    formula: "E_jon = \u2212E_n"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/orbitalGraph.ts
var BASELINE_MASS_SOLAR = 1;
var BASELINE_RADIUS_AU = 1;
function buildOrbitalModelGraph() {
  const graph = new ModelGraph();
  graph.addNode(
    {
      id: "centralMassSolar",
      label: "Masa gwiazdy centralnej",
      unit: "M\u2609",
      domain: "mechanika orbitalna",
      honesty: "exact",
      honestyNote: "Parametr wej\u015Bciowy \u2014 nie obliczony, ustawiany bezpo\u015Brednio przez u\u017Cytkownika.",
      derivation: "direct",
      inputs: [],
      compute: (inputs) => inputs.centralMassSolar ?? BASELINE_MASS_SOLAR,
      formula: "M (parametr)"
    },
    BASELINE_MASS_SOLAR
  );
  graph.addNode(
    {
      id: "orbitalRadiusAu",
      label: "Promie\u0144 orbity",
      unit: "AU",
      domain: "mechanika orbitalna",
      honesty: "exact",
      honestyNote: "Parametr wej\u015Bciowy \u2014 p\xF3\u0142o\u015B wielka orbity (ko\u0142owej, e=0). Ustawiany bezpo\u015Brednio.",
      derivation: "direct",
      inputs: [],
      compute: (inputs) => inputs.orbitalRadiusAu ?? BASELINE_RADIUS_AU,
      formula: "a (parametr)"
    },
    BASELINE_RADIUS_AU
  );
  graph.addNode({
    id: "orbitalPeriodYears",
    label: "Okres orbitalny",
    unit: "lat",
    domain: "mechanika orbitalna",
    honesty: "exact",
    honestyNote: "III prawo Keplera w jednostkach astronomicznych (AU, lata, masy S\u0142o\u0144ca): T = 2\u03C0\u221A(a\xB3/(G\xB7M)), G=4\u03C0\xB2 w tych jednostkach \u2014 dok\u0142adny wynik, ta sama formu\u0142a co Universe Lab. Zale\u017Cy od OBU parametr\xF3w (masa i promie\u0144).",
    derivation: "direct",
    inputs: ["centralMassSolar", "orbitalRadiusAu"],
    compute: (inputs) => {
      const mu = G_ASTRO_YEAR * inputs.centralMassSolar;
      return 2 * Math.PI * Math.sqrt(Math.pow(inputs.orbitalRadiusAu, 3) / mu);
    },
    formula: "T = 2\u03C0\u221A(a\xB3 / (4\u03C0\xB2\xB7M))"
  });
  graph.addNode({
    id: "orbitalSpeedAuPerYear",
    label: "Pr\u0119dko\u015B\u0107 orbitalna",
    unit: "AU/rok",
    domain: "mechanika orbitalna",
    honesty: "exact",
    honestyNote: "R\xF3wnanie vis-viva dla orbity ko\u0142owej (r=a): v\xB2=\u03BC(2/r\u22121/a) \u2014 ta sama funkcja core/physics.ts::visVivaSpeed, kt\xF3r\u0105 Universe Lab liczy dla prawdziwych planet. Zale\u017Cy od OBU parametr\xF3w.",
    derivation: "direct",
    inputs: ["centralMassSolar", "orbitalRadiusAu"],
    compute: (inputs) => {
      const mu = G_ASTRO_YEAR * inputs.centralMassSolar;
      return visVivaSpeed(mu, inputs.orbitalRadiusAu, inputs.orbitalRadiusAu);
    },
    formula: "v = \u221A(\u03BC(2/r \u2212 1/a)), r=a (orbita ko\u0142owa)"
  });
  graph.addNode({
    id: "relativeTidalStrength",
    label: "Wzgl\u0119dna si\u0142a p\u0142ywowa",
    unit: "\xD7 (bazowo 1,0)",
    domain: "mechanika orbitalna",
    honesty: "exact",
    honestyNote: "Przyspieszenie p\u0142ywowe jest dok\u0142adnie proporcjonalne do M/r\xB3 (standardowy gradient si\u0142y p\u0142ywowej). Odniesione do stanu bazowego (1 M\u2609 przy 1 AU) \u2014 dok\u0142adna proporcja (M/M_bazowe)\xB7(r_bazowe/r)\xB3, nie oszacowanie. Zale\u017Cy od OBU parametr\xF3w.",
    derivation: "direct",
    inputs: ["centralMassSolar", "orbitalRadiusAu"],
    compute: (inputs) => inputs.centralMassSolar / BASELINE_MASS_SOLAR * Math.pow(BASELINE_RADIUS_AU / inputs.orbitalRadiusAu, 3),
    formula: "p\u0142ywy \u221D M/r\xB3 \u2192 (M/M\u2080)\xB7(r\u2080/r)\xB3"
  });
  return graph;
}

// packages/frontend/src/core/modelGraph/atmosphericEscapeGraph.ts
var G = 6674e-14;
var KB = 1380649e-29;
var AMU = 166053907e-35;
var M_EARTH = 5972e21;
var R_EARTH = 6371e3;
var BASELINE_LUMINOSITY_SOLAR = 1;
var BASELINE_ORBIT_AU = 1;
var BASELINE_ALBEDO = 0.3;
var BASELINE_PLANET_MASS_EARTH = 1;
var BASELINE_PLANET_RADIUS_EARTH = 1;
var BASELINE_MOLECULE_AMU = 18;
function buildAtmosphericEscapeGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "stellarLuminositySolar",
      label: "Jasno\u015B\u0107 gwiazdy L\u22C6",
      unit: "L\u2609",
      domain: "astronomia gwiazdowa",
      honesty: "exact",
      honestyNote: "Jasno\u015B\u0107 gwiazdy w jednostkach S\u0142o\u0144ca \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.stellarLuminositySolar ?? BASELINE_LUMINOSITY_SOLAR,
      formula: "L\u22C6 (parametr)"
    },
    BASELINE_LUMINOSITY_SOLAR
  );
  g.addNode(
    {
      id: "orbitalDistanceAu",
      label: "Odleg\u0142o\u015B\u0107 orbitalna a",
      unit: "AU",
      domain: "astronomia gwiazdowa",
      honesty: "exact",
      honestyNote: "Odleg\u0142o\u015B\u0107 planety od gwiazdy \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.orbitalDistanceAu ?? BASELINE_ORBIT_AU,
      formula: "a (parametr)"
    },
    BASELINE_ORBIT_AU
  );
  g.addNode(
    {
      id: "planetAlbedo",
      label: "Albedo planety A",
      unit: "",
      domain: "klimat planetarny",
      honesty: "exact",
      honestyNote: "U\u0142amek \u015Bwiat\u0142a odbijanego (0\u20131) \u2014 zadany. Ziemia \u2248 0,3.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.planetAlbedo ?? BASELINE_ALBEDO,
      formula: "A (parametr)"
    },
    BASELINE_ALBEDO
  );
  g.addNode(
    {
      id: "planetMassEarth",
      label: "Masa planety M_p",
      unit: "M\u2295",
      domain: "mechanika (grawitacja)",
      honesty: "exact",
      honestyNote: "Masa planety w masach Ziemi \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.planetMassEarth ?? BASELINE_PLANET_MASS_EARTH,
      formula: "M_p (parametr)"
    },
    BASELINE_PLANET_MASS_EARTH
  );
  g.addNode(
    {
      id: "planetRadiusEarth",
      label: "Promie\u0144 planety R_p",
      unit: "R\u2295",
      domain: "mechanika (grawitacja)",
      honesty: "exact",
      honestyNote: "Promie\u0144 planety w promieniach Ziemi \u2014 zadany.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.planetRadiusEarth ?? BASELINE_PLANET_RADIUS_EARTH,
      formula: "R_p (parametr)"
    },
    BASELINE_PLANET_RADIUS_EARTH
  );
  g.addNode(
    {
      id: "moleculeMassAmu",
      label: "Masa cz\u0105steczki gazu m",
      unit: "u",
      domain: "chemia / sk\u0142ad atmosfery",
      honesty: "exact",
      honestyNote: "Masa cz\u0105steczki w jednostkach masy atomowej: H\u2082=2, He=4, H\u2082O=18, N\u2082=28, CO\u2082=44. Zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.moleculeMassAmu ?? BASELINE_MOLECULE_AMU,
      formula: "m (parametr)"
    },
    BASELINE_MOLECULE_AMU
  );
  g.addNode({
    id: "equilibriumTempK",
    label: "Temperatura r\xF3wnowagowa T_eq",
    unit: "K",
    domain: "klimat planetarny",
    honesty: "simplified",
    honestyNote: "T_eq = 278,5\xB7((1\u2212A)\xB7L\u22C6/a\xB2)^\xBC \u2014 bilans strumienia gwiazdy. PRZYBLI\u017BONE: to temperatura r\xF3wnowagi promienistej BEZ efektu cieplarnianego (Ziemia realnie ~288 K vs 255 K r\xF3wnowagowe). Pomija atmosfer\u0119, rotacj\u0119, wewn\u0119trzne ciep\u0142o.",
    derivation: "approximate",
    inputs: ["stellarLuminositySolar", "orbitalDistanceAu", "planetAlbedo"],
    compute: (i) => 278.5 * Math.pow((1 - i.planetAlbedo) * i.stellarLuminositySolar / (i.orbitalDistanceAu * i.orbitalDistanceAu), 0.25),
    formula: "T_eq = 278,5\xB7((1\u2212A)\xB7L\u22C6/a\xB2)^\xBC"
  });
  g.addNode({
    id: "escapeVelocityMs",
    label: "Pr\u0119dko\u015B\u0107 ucieczki v_esc",
    unit: "m/s",
    domain: "mechanika (grawitacja)",
    honesty: "exact",
    honestyNote: "v_esc = \u221A(2GM/R) \u2014 dok\u0142adne. Dla Ziemi ~11,2 km/s.",
    derivation: "direct",
    inputs: ["planetMassEarth", "planetRadiusEarth"],
    compute: (i) => Math.sqrt(2 * G * i.planetMassEarth * M_EARTH / (i.planetRadiusEarth * R_EARTH)),
    formula: "v_esc = \u221A(2GM/R)"
  });
  g.addNode({
    id: "thermalVelocityMs",
    label: "Pr\u0119dko\u015B\u0107 cieplna v_th (najcz\u0119stsza)",
    unit: "m/s",
    domain: "fizyka termiczna",
    honesty: "exact",
    honestyNote: "v_th = \u221A(2k_BT/m) \u2014 najbardziej prawdopodobna pr\u0119dko\u015B\u0107 w rozk\u0142adzie Maxwella\u2013Boltzmanna. Dok\u0142adne dla gazu w r\xF3wnowadze termicznej w temperaturze T_eq.",
    derivation: "direct",
    inputs: ["equilibriumTempK", "moleculeMassAmu"],
    compute: (i) => Math.sqrt(2 * KB * i.equilibriumTempK / (i.moleculeMassAmu * AMU)),
    formula: "v_th = \u221A(2k_BT/m)"
  });
  g.addNode({
    id: "jeansParameter",
    label: "Parametr ucieczki Jeansa \u03BB",
    unit: "",
    domain: "ucieczka atmosfery (mi\u0119dzydziedzinowa)",
    honesty: "simplified",
    honestyNote: "\u03BB = v_esc\xB2/v_th\xB2 = GMm/(k_BTR). Regu\u0142a kciuka: \u03BB \u2273 15\u201320 \u2192 gaz utrzymany przez miliardy lat; ma\u0142e \u03BB \u2192 szybka ucieczka termiczna. PRZYBLI\u017BONE: tylko ucieczka Jeansa (termiczna), pomija ucieczk\u0119 hydrodynamiczn\u0105, wiatr gwiazdowy, brak pola magnetycznego.",
    derivation: "approximate",
    inputs: ["escapeVelocityMs", "thermalVelocityMs"],
    compute: (i) => i.escapeVelocityMs * i.escapeVelocityMs / (i.thermalVelocityMs * i.thermalVelocityMs),
    formula: "\u03BB = v_esc\xB2/v_th\xB2"
  });
  g.addNode({
    id: "thermalToEscapeRatio",
    label: "Stosunek v_th/v_esc",
    unit: "",
    domain: "ucieczka atmosfery (mi\u0119dzydziedzinowa)",
    honesty: "simplified",
    honestyNote: "v_th/v_esc \u2014 gdy przekracza ~1/6, ucieczka termiczna staje si\u0119 szybka w skali geologicznej. Wielko\u015B\u0107 mi\u0119dzydziedzinowa (termika \xD7 grawitacja).",
    derivation: "approximate",
    inputs: ["thermalVelocityMs", "escapeVelocityMs"],
    compute: (i) => i.thermalVelocityMs / i.escapeVelocityMs,
    formula: "v_th / v_esc"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/specialRelativityGraph.ts
var BASELINE_BETA = 0.6;
var BASELINE_PROPER_TIME_S = 10;
var BASELINE_REST_LENGTH_M = 10;
function buildSpecialRelativityGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "velocityFraction",
      label: "Pr\u0119dko\u015B\u0107 \u03B2 = v/c",
      unit: "",
      domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
      honesty: "exact",
      honestyNote: "Pr\u0119dko\u015B\u0107 jako u\u0142amek pr\u0119dko\u015Bci \u015Bwiat\u0142a. Wa\u017Cne 0 \u2264 \u03B2 < 1; przy \u03B2\u21921 efekty rozbiegaj\u0105 si\u0119 do niesko\u0144czono\u015Bci.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.velocityFraction ?? BASELINE_BETA,
      formula: "\u03B2 (parametr)"
    },
    BASELINE_BETA
  );
  g.addNode(
    {
      id: "properTimeSeconds",
      label: "Czas w\u0142asny \u0394\u03C4",
      unit: "s",
      domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
      honesty: "exact",
      honestyNote: "Czas mierzony w uk\u0142adzie poruszaj\u0105cego si\u0119 zegara \u2014 zadany.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.properTimeSeconds ?? BASELINE_PROPER_TIME_S,
      formula: "\u0394\u03C4 (parametr)"
    },
    BASELINE_PROPER_TIME_S
  );
  g.addNode(
    {
      id: "restLengthMeters",
      label: "D\u0142ugo\u015B\u0107 spoczynkowa L\u2080",
      unit: "m",
      domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
      honesty: "exact",
      honestyNote: "D\u0142ugo\u015B\u0107 obiektu w jego uk\u0142adzie spoczynkowym \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.restLengthMeters ?? BASELINE_REST_LENGTH_M,
      formula: "L\u2080 (parametr)"
    },
    BASELINE_REST_LENGTH_M
  );
  g.addNode({
    id: "lorentzGammaFactor",
    label: "Czynnik Lorentza \u03B3",
    unit: "",
    domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
    honesty: "exact",
    honestyNote: "\u03B3 = 1/\u221A(1\u2212\u03B2\xB2) \u2014 dok\u0142adny. Ro\u015Bnie nieograniczenie przy \u03B2\u21921.",
    derivation: "direct",
    inputs: ["velocityFraction"],
    compute: (i) => lorentzGamma(i.velocityFraction),
    formula: "\u03B3 = 1/\u221A(1\u2212\u03B2\xB2)"
  });
  g.addNode({
    id: "dilatedTimeSeconds",
    label: "Czas rozci\u0105gni\u0119ty \u0394t (obserwator)",
    unit: "s",
    domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
    honesty: "exact",
    honestyNote: "\u0394t = \u03B3\xB7\u0394\u03C4 \u2014 poruszaj\u0105cy si\u0119 zegar chodzi wolniej z punktu widzenia obserwatora. Dok\u0142adne.",
    derivation: "direct",
    inputs: ["lorentzGammaFactor", "properTimeSeconds"],
    compute: (i) => i.lorentzGammaFactor * i.properTimeSeconds,
    formula: "\u0394t = \u03B3\xB7\u0394\u03C4"
  });
  g.addNode({
    id: "contractedLengthMeters",
    label: "D\u0142ugo\u015B\u0107 skr\xF3cona L (obserwator)",
    unit: "m",
    domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
    honesty: "exact",
    honestyNote: "L = L\u2080/\u03B3 \u2014 obiekt skr\xF3cony w kierunku ruchu z punktu widzenia obserwatora. Dok\u0142adne.",
    derivation: "direct",
    inputs: ["restLengthMeters", "lorentzGammaFactor"],
    compute: (i) => i.restLengthMeters / i.lorentzGammaFactor,
    formula: "L = L\u2080/\u03B3"
  });
  g.addNode({
    id: "dopplerApproaching",
    label: "Doppler (zbli\u017Canie) f_obs/f_\u017Ar",
    unit: "\xD7",
    domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
    honesty: "exact",
    honestyNote: "Relatywistyczny Doppler pod\u0142u\u017Cny przy zbli\u017Caniu: \u221A((1+\u03B2)/(1\u2212\u03B2)) \u2014 przesuni\u0119cie ku fioletowi. Dok\u0142adne.",
    derivation: "direct",
    inputs: ["velocityFraction"],
    compute: (i) => Math.sqrt((1 + i.velocityFraction) / (1 - i.velocityFraction)),
    formula: "\u221A((1+\u03B2)/(1\u2212\u03B2))"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/relativisticEnergyGraph.ts
var BASELINE_REST_MASS_MEV = 0.511;
var BASELINE_BETA2 = 0.9;
function buildRelativisticEnergyGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "restMassMeV",
      label: "Masa spoczynkowa m",
      unit: "MeV/c\xB2",
      domain: "mechanika relatywistyczna",
      honesty: "exact",
      honestyNote: "Masa spoczynkowa cz\u0105stki (elektron 0,511; proton 938,3) \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.restMassMeV ?? BASELINE_REST_MASS_MEV,
      formula: "m (parametr)"
    },
    BASELINE_REST_MASS_MEV
  );
  g.addNode(
    {
      id: "velocityFraction",
      label: "Pr\u0119dko\u015B\u0107 \u03B2 = v/c",
      unit: "",
      domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
      honesty: "exact",
      honestyNote: "Pr\u0119dko\u015B\u0107 cz\u0105stki jako u\u0142amek c. Wa\u017Cne 0 \u2264 \u03B2 < 1.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.velocityFraction ?? BASELINE_BETA2,
      formula: "\u03B2 (parametr)"
    },
    BASELINE_BETA2
  );
  g.addNode({
    id: "lorentzGammaFactor",
    label: "Czynnik Lorentza \u03B3",
    unit: "",
    domain: "szczeg\xF3lna teoria wzgl\u0119dno\u015Bci",
    honesty: "exact",
    honestyNote: "\u03B3 = 1/\u221A(1\u2212\u03B2\xB2). Dok\u0142adne; ro\u015Bnie nieograniczenie przy \u03B2\u21921.",
    derivation: "direct",
    inputs: ["velocityFraction"],
    compute: (i) => lorentzGamma(i.velocityFraction),
    formula: "\u03B3 = 1/\u221A(1\u2212\u03B2\xB2)"
  });
  g.addNode({
    id: "totalEnergyMeV",
    label: "Energia ca\u0142kowita E",
    unit: "MeV",
    domain: "mechanika relatywistyczna",
    honesty: "exact",
    honestyNote: "E = \u03B3mc\xB2 \u2014 \u0142\u0105czy mas\u0119 (mechanika) z \u03B3 (STW). Dok\u0142adne dla cz\u0105stki swobodnej.",
    derivation: "direct",
    inputs: ["lorentzGammaFactor", "restMassMeV"],
    compute: (i) => i.lorentzGammaFactor * i.restMassMeV,
    formula: "E = \u03B3mc\xB2"
  });
  g.addNode({
    id: "kineticEnergyMeV",
    label: "Energia kinetyczna E_kin",
    unit: "MeV",
    domain: "mechanika relatywistyczna",
    honesty: "exact",
    honestyNote: "E_kin = (\u03B3\u22121)mc\xB2 \u2014 dok\u0142adna relatywistyczna energia kinetyczna. Dla \u03B2\u226A1 d\u0105\u017Cy do \xBDmv\xB2.",
    derivation: "direct",
    inputs: ["lorentzGammaFactor", "restMassMeV"],
    compute: (i) => (i.lorentzGammaFactor - 1) * i.restMassMeV,
    formula: "E_kin = (\u03B3\u22121)mc\xB2"
  });
  g.addNode({
    id: "momentumMeVc",
    label: "P\u0119d p",
    unit: "MeV/c",
    domain: "mechanika relatywistyczna",
    honesty: "exact",
    honestyNote: "p = \u03B3m\u03B2c \u2014 relatywistyczny p\u0119d. Dok\u0142adne.",
    derivation: "direct",
    inputs: ["lorentzGammaFactor", "restMassMeV", "velocityFraction"],
    compute: (i) => i.lorentzGammaFactor * i.restMassMeV * i.velocityFraction,
    formula: "p = \u03B3m\u03B2c"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/chemistryKineticsGraph.ts
var R_GAS = 8.314;
var T_ROOM = 298.15;
var BASELINE_TEMPERATURE_K = 350;
var BASELINE_EA_KJ = 60;
var BASELINE_LOG10_A = 11;
function buildChemistryKineticsGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "temperatureK",
      label: "Temperatura T",
      unit: "K",
      domain: "kinetyka chemiczna",
      honesty: "exact",
      honestyNote: "Temperatura bezwzgl\u0119dna reakcji \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.temperatureK ?? BASELINE_TEMPERATURE_K,
      formula: "T (parametr)"
    },
    BASELINE_TEMPERATURE_K
  );
  g.addNode(
    {
      id: "activationEnergyKJ",
      label: "Energia aktywacji E\u2090",
      unit: "kJ/mol",
      domain: "kinetyka chemiczna",
      honesty: "exact",
      honestyNote: "Bariera energetyczna reakcji \u2014 z danych/eksperymentu; tu zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.activationEnergyKJ ?? BASELINE_EA_KJ,
      formula: "E\u2090 (parametr)"
    },
    BASELINE_EA_KJ
  );
  g.addNode(
    {
      id: "preExponentialLog10",
      label: "Czynnik przedwyk\u0142adniczy log\u2081\u2080A",
      unit: "log\u2081\u2080(1/s)",
      domain: "kinetyka chemiczna",
      honesty: "simplified",
      honestyNote: "log\u2081\u2080 czynnika cz\u0119sto\u015Bci A. Zale\u017Cy od mechanizmu; tu zadany jako rz\u0105d wielko\u015Bci.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.preExponentialLog10 ?? BASELINE_LOG10_A,
      formula: "log\u2081\u2080A (parametr)"
    },
    BASELINE_LOG10_A
  );
  g.addNode({
    id: "rateConstant",
    label: "Sta\u0142a szybko\u015Bci k",
    unit: "1/s",
    domain: "kinetyka chemiczna",
    honesty: "simplified",
    honestyNote: "Arrhenius: k = A\xB7exp(\u2212E\u2090/RT). MODEL PRZYBLI\u017BONY \u2014 zak\u0142ada A i E\u2090 niezale\u017Cne od T oraz reakcj\u0119 elementarn\u0105. Dobre dla trendu, nie dla mechanizmu.",
    derivation: "approximate",
    inputs: ["preExponentialLog10", "activationEnergyKJ", "temperatureK"],
    compute: (i) => Math.pow(10, i.preExponentialLog10) * Math.exp(-(i.activationEnergyKJ * 1e3) / (R_GAS * i.temperatureK)),
    formula: "k = A\xB7exp(\u2212E\u2090/RT)"
  });
  g.addNode({
    id: "halfLifeFirstOrder",
    label: "Czas po\u0142owicznej przemiany (I rz\u0119du) t\xBD",
    unit: "s",
    domain: "kinetyka chemiczna",
    honesty: "simplified",
    honestyNote: "t\xBD = ln2/k \u2014 DOK\u0141ADNE dla reakcji I rz\u0119du. Dla innych rz\u0119d\xF3w t\xBD zale\u017Cy od st\u0119\u017Cenia i ten wz\xF3r NIE obowi\u0105zuje.",
    derivation: "direct",
    inputs: ["rateConstant"],
    compute: (i) => Math.LN2 / i.rateConstant,
    formula: "t\xBD = ln2 / k"
  });
  g.addNode({
    id: "speedupVsRoom",
    label: "Przyspieszenie wzgl\u0119dem 25\xB0C",
    unit: "\xD7",
    domain: "kinetyka chemiczna",
    honesty: "exact",
    honestyNote: "k(T)/k(298,15K) = exp(E\u2090/R\xB7(1/298,15 \u2212 1/T)). NIEZALE\u017BNE od A (skraca si\u0119) \u2014 najczystszy wynik modelu Arrheniusa.",
    derivation: "direct",
    inputs: ["activationEnergyKJ", "temperatureK"],
    compute: (i) => Math.exp(i.activationEnergyKJ * 1e3 / R_GAS * (1 / T_ROOM - 1 / i.temperatureK)),
    formula: "exp(E\u2090/R\xB7(1/T_pok \u2212 1/T))"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/gaussianGraph.ts
var SQRT_2PI = Math.sqrt(2 * Math.PI);
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.sign(x) * y;
}
var BASELINE_MEAN = 0;
var BASELINE_SIGMA = 1;
var BASELINE_X = 1;
function buildGaussianGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "mean",
      label: "\u015Arednia \u03BC",
      unit: "",
      domain: "statystyka",
      honesty: "exact",
      honestyNote: "Warto\u015B\u0107 oczekiwana rozk\u0142adu \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.mean ?? BASELINE_MEAN,
      formula: "\u03BC (parametr)"
    },
    BASELINE_MEAN
  );
  g.addNode(
    {
      id: "sigma",
      label: "Odchylenie standardowe \u03C3",
      unit: "",
      domain: "statystyka",
      honesty: "exact",
      honestyNote: "Rozrzut rozk\u0142adu (\u03C3>0) \u2014 zadany.",
      derivation: "direct",
      inputs: [],
      compute: (i) => Math.max(1e-6, i.sigma ?? BASELINE_SIGMA),
      formula: "\u03C3 (parametr)"
    },
    BASELINE_SIGMA
  );
  g.addNode(
    {
      id: "xValue",
      label: "Punkt x",
      unit: "",
      domain: "statystyka",
      honesty: "exact",
      honestyNote: "Punkt, w kt\xF3rym oceniamy rozk\u0142ad \u2014 zadany.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.xValue ?? BASELINE_X,
      formula: "x (parametr)"
    },
    BASELINE_X
  );
  g.addNode({
    id: "zScore",
    label: "Warto\u015B\u0107 standaryzowana z",
    unit: "\u03C3",
    domain: "statystyka",
    honesty: "exact",
    honestyNote: "z = (x\u2212\u03BC)/\u03C3 \u2014 o ile odchyle\u0144 standardowych x jest od \u015Bredniej. Dok\u0142adne.",
    derivation: "direct",
    inputs: ["xValue", "mean", "sigma"],
    compute: (i) => (i.xValue - i.mean) / i.sigma,
    formula: "z = (x\u2212\u03BC)/\u03C3"
  });
  g.addNode({
    id: "pdfValue",
    label: "G\u0119sto\u015B\u0107 prawdopodobie\u0144stwa f(x)",
    unit: "",
    domain: "statystyka",
    honesty: "exact",
    honestyNote: "f(x) = e^(\u2212z\xB2/2)/(\u03C3\u221A(2\u03C0)) \u2014 dok\u0142adna g\u0119sto\u015B\u0107 rozk\u0142adu normalnego.",
    derivation: "direct",
    inputs: ["zScore", "sigma"],
    compute: (i) => Math.exp(-(i.zScore * i.zScore) / 2) / (i.sigma * SQRT_2PI),
    formula: "f(x) = e^(\u2212z\xB2/2)/(\u03C3\u221A(2\u03C0))"
  });
  g.addNode({
    id: "probWithinZ",
    label: "P(w przedziale \xB1|z|)",
    unit: "",
    domain: "statystyka",
    honesty: "simplified",
    honestyNote: "P(\u03BC\u2212|x\u2212\u03BC| < X < \u03BC+|x\u2212\u03BC|) = erf(|z|/\u221A2). Dla |z|=1 \u2192 0,683 (regu\u0142a 68%). erf liczone przybli\u017Ceniem numerycznym (Abramowitz\u2013Stegun, b\u0142\u0105d < 1,5\xB710\u207B\u2077).",
    derivation: "approximate",
    inputs: ["zScore"],
    compute: (i) => erf(Math.abs(i.zScore) / Math.SQRT2),
    formula: "P = erf(|z|/\u221A2)"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/logisticGrowthGraph.ts
var BASELINE_GROWTH_RATE = 0.4;
var BASELINE_CAPACITY = 1e3;
var BASELINE_INITIAL = 10;
var BASELINE_TIME = 10;
function buildLogisticGrowthGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "growthRate",
      label: "Tempo wzrostu r",
      unit: "1/czas",
      domain: "dynamika populacji",
      honesty: "exact",
      honestyNote: "Wewn\u0119trzne tempo wzrostu \u2014 zadane.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.growthRate ?? BASELINE_GROWTH_RATE,
      formula: "r (parametr)"
    },
    BASELINE_GROWTH_RATE
  );
  g.addNode(
    {
      id: "carryingCapacity",
      label: "Pojemno\u015B\u0107 \u015Brodowiska K",
      unit: "osobn.",
      domain: "dynamika populacji",
      honesty: "exact",
      honestyNote: "Maksymalna trwa\u0142a liczebno\u015B\u0107 \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.carryingCapacity ?? BASELINE_CAPACITY,
      formula: "K (parametr)"
    },
    BASELINE_CAPACITY
  );
  g.addNode(
    {
      id: "initialPopulation",
      label: "Populacja pocz\u0105tkowa N\u2080",
      unit: "osobn.",
      domain: "dynamika populacji",
      honesty: "exact",
      honestyNote: "Liczebno\u015B\u0107 w chwili t=0 \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => Math.max(1e-6, i.initialPopulation ?? BASELINE_INITIAL),
      formula: "N\u2080 (parametr)"
    },
    BASELINE_INITIAL
  );
  g.addNode(
    {
      id: "timeElapsed",
      label: "Czas t",
      unit: "czas",
      domain: "dynamika populacji",
      honesty: "exact",
      honestyNote: "Up\u0142yw czasu od chwili pocz\u0105tkowej \u2014 zadany.",
      derivation: "direct",
      inputs: [],
      compute: (i) => i.timeElapsed ?? BASELINE_TIME,
      formula: "t (parametr)"
    },
    BASELINE_TIME
  );
  g.addNode({
    id: "populationAtT",
    label: "Populacja N(t)",
    unit: "osobn.",
    domain: "dynamika populacji",
    honesty: "simplified",
    honestyNote: "N(t) = K/(1+((K\u2212N\u2080)/N\u2080)e^(\u2212rt)) \u2014 \u015Bcis\u0142e rozwi\u0105zanie r\xF3wnania logistycznego. MODEL uproszczony: sta\u0142e r,K, bez struktury wiekowej, op\xF3\u017Anie\u0144, drapie\u017Cnictwa i losowo\u015Bci.",
    derivation: "direct",
    inputs: ["carryingCapacity", "initialPopulation", "growthRate", "timeElapsed"],
    compute: (i) => i.carryingCapacity / (1 + (i.carryingCapacity - i.initialPopulation) / i.initialPopulation * Math.exp(-i.growthRate * i.timeElapsed)),
    formula: "N(t) = K/(1+((K\u2212N\u2080)/N\u2080)e^(\u2212rt))"
  });
  g.addNode({
    id: "fractionOfCapacity",
    label: "Wype\u0142nienie pojemno\u015Bci N/K",
    unit: "%",
    domain: "dynamika populacji",
    honesty: "simplified",
    honestyNote: "100\xB7N(t)/K \u2014 jak blisko populacja jest nasycenia. Powy\u017Cej ~99% wzrost praktycznie ustaje.",
    derivation: "direct",
    inputs: ["populationAtT", "carryingCapacity"],
    compute: (i) => i.populationAtT / i.carryingCapacity * 100,
    formula: "100\xB7N/K"
  });
  return g;
}

// packages/frontend/src/core/modelGraph/photonGraph.ts
var HC_EV_NM = 1239.841984;
var C_NM_THZ = 299792.458;
var EV_TO_KJMOL = 96.485332;
var BASELINE_WAVELENGTH_NM = 500;
function buildPhotonGraph() {
  const g = new ModelGraph();
  g.addNode(
    {
      id: "wavelengthNm",
      label: "D\u0142ugo\u015B\u0107 fali \u03BB",
      unit: "nm",
      domain: "mechanika kwantowa (foton)",
      honesty: "exact",
      honestyNote: "D\u0142ugo\u015B\u0107 fali fotonu (widzialne ~380\u2013740 nm) \u2014 zadana.",
      derivation: "direct",
      inputs: [],
      compute: (i) => Math.max(1e-3, i.wavelengthNm ?? BASELINE_WAVELENGTH_NM),
      formula: "\u03BB (parametr)"
    },
    BASELINE_WAVELENGTH_NM
  );
  g.addNode({
    id: "photonEnergyEV",
    label: "Energia fotonu E",
    unit: "eV",
    domain: "mechanika kwantowa (foton)",
    honesty: "exact",
    honestyNote: "E = hc/\u03BB. DOK\u0141ADNE (hc = 1239,84 eV\xB7nm). Dla 500 nm \u2248 2,48 eV.",
    derivation: "direct",
    inputs: ["wavelengthNm"],
    compute: (i) => HC_EV_NM / i.wavelengthNm,
    formula: "E = hc/\u03BB"
  });
  g.addNode({
    id: "photonFrequencyTHz",
    label: "Cz\u0119stotliwo\u015B\u0107 f",
    unit: "THz",
    domain: "mechanika kwantowa (foton)",
    honesty: "exact",
    honestyNote: "f = c/\u03BB. DOK\u0141ADNE. Dla 500 nm \u2248 600 THz (\u015Bwiat\u0142o zielone).",
    derivation: "direct",
    inputs: ["wavelengthNm"],
    compute: (i) => C_NM_THZ / i.wavelengthNm,
    formula: "f = c/\u03BB"
  });
  g.addNode({
    id: "photonEnergyKJmol",
    label: "Energia fotonu (skala chemiczna)",
    unit: "kJ/mol",
    domain: "chemia (energia wi\u0105za\u0144)",
    honesty: "exact",
    honestyNote: "KRAW\u0118D\u0179 MI\u0118DZYDZIEDZINOWA: energia fotonu (kwantowa) przeliczona na skal\u0119 chemiczn\u0105 (1 eV = 96,485 kJ/mol, \u015Bci\u015Ble). Pozwala por\xF3wna\u0107 z energiami wi\u0105za\u0144: C\u2013C \u2248 348, C=O \u2248 745 kJ/mol. Foton UV (~400 kJ/mol) mo\u017Ce rozrywa\u0107 niekt\xF3re wi\u0105zania \u2014 sedno fotochemii.",
    derivation: "direct",
    inputs: ["photonEnergyEV"],
    compute: (i) => i.photonEnergyEV * EV_TO_KJMOL,
    formula: "E[kJ/mol] = E[eV]\xB796,485"
  });
  return g;
}

// packages/frontend/src/core/compute/cheminformatics.ts
var ATOMIC_WEIGHTS = {
  H: 1.008,
  He: 4.0026,
  Li: 6.94,
  Be: 9.0122,
  B: 10.81,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  Ne: 20.18,
  Na: 22.99,
  Mg: 24.305,
  Al: 26.982,
  Si: 28.085,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  Ar: 39.948,
  K: 39.098,
  Ca: 40.078,
  Fe: 55.845,
  Co: 58.933,
  Ni: 58.693,
  Cu: 63.546,
  Zn: 65.38,
  Se: 78.971,
  Br: 79.904,
  Ag: 107.87,
  I: 126.9,
  Pt: 195.08,
  Au: 196.97
};
function parseFormula(formula) {
  const raw = String(formula ?? "").trim();
  if (!raw) return { ok: false, error: "Pusty wz\xF3r.", counts: {} };
  if (/[^A-Za-z0-9]/.test(raw)) return { ok: false, error: "Dozwolone tylko litery i cyfry (bez nawias\xF3w, kropek, \u0142adunk\xF3w) w v1.", counts: {} };
  const counts = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let consumed = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index !== consumed) break;
    const el = m[1];
    const n = m[2] === "" ? 1 : parseInt(m[2], 10);
    if (!(el in ATOMIC_WEIGHTS)) return { ok: false, error: `Nieznany pierwiastek \u201E${el}".`, counts: {} };
    counts[el] = (counts[el] ?? 0) + n;
    consumed += m[0].length;
  }
  if (consumed !== raw.length) return { ok: false, error: "Nie uda\u0142o si\u0119 sparsowa\u0107 ca\u0142ego wzoru.", counts: {} };
  if (Object.keys(counts).length === 0) return { ok: false, error: "Brak pierwiastk\xF3w.", counts: {} };
  return { ok: true, counts };
}
function molecularWeight(counts) {
  let mw = 0;
  for (const [el, n] of Object.entries(counts)) mw += (ATOMIC_WEIGHTS[el] ?? 0) * n;
  return mw;
}
function massFractions(counts) {
  const mw = molecularWeight(counts) || 1;
  const out = {};
  for (const [el, n] of Object.entries(counts)) out[el] = (ATOMIC_WEIGHTS[el] ?? 0) * n / mw;
  return out;
}
function atomCount(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
function degreeOfUnsaturation(counts) {
  const c = counts.C ?? 0;
  const n = counts.N ?? 0;
  const h = counts.H ?? 0;
  const x = (counts.F ?? 0) + (counts.Cl ?? 0) + (counts.Br ?? 0) + (counts.I ?? 0);
  return (2 * c + 2 + n - h - x) / 2;
}
function hillFormula(counts) {
  const els = Object.keys(counts);
  const ordered = [];
  if (counts.C) {
    ordered.push("C");
    if (counts.H) ordered.push("H");
    ordered.push(...els.filter((e) => e !== "C" && e !== "H").sort());
  } else {
    ordered.push(...els.sort());
  }
  return ordered.map((e) => counts[e] === 1 ? e : `${e}${counts[e]}`).join("");
}
export {
  ATOMIC_WEIGHTS,
  EARTH_MASSES_PER_SOLAR,
  G_ASTRO,
  G_ASTRO_YEAR,
  MOND_A0_ASTRO,
  ModelGraph,
  SCHWARZSCHILD_CRITICAL_IMPACT,
  TESSERACT_EDGES,
  TESSERACT_VERTICES,
  atomCount,
  binarySeparationMeters,
  bondPolarity,
  buildAtmosphericEscapeGraph,
  buildBohrModelGraph,
  buildChemistryKineticsGraph,
  buildGaussianGraph,
  buildLogisticGrowthGraph,
  buildNuclearModelGraph,
  buildOrbitalModelGraph,
  buildPhotonGraph,
  buildRelativisticEnergyGraph,
  buildSpecialRelativityGraph,
  chirpFrequency,
  chirpMassSolar,
  chshS,
  circularVelocity,
  decayRemaining,
  degreeOfUnsaturation,
  dnaMeltingTempWallace,
  equivalenceVolumeMl,
  exponentialDiskMass,
  gaussianPdf,
  hillFormula,
  iscoFrequency,
  isothermalHaloMass,
  kardashevPower,
  keplerPosition,
  kerrCriticalImpactParameter,
  kerrEquatorialF,
  kerrErgosphereEquatorRadius,
  kerrHorizonRadius,
  kerrPhotonOrbitRadius,
  lensAmplification,
  lensImagePositions,
  lorentzGamma,
  lorentzTime,
  lorenzChaosThreshold,
  lorenzDerivative,
  massFractions,
  measurementTensionSigma,
  molecularWeight,
  mondAcceleration,
  orbitalElementsFromState,
  parseFormula,
  project4Dto3D,
  rotate4D,
  sampleLocalHiddenPair,
  sampleSingletPair,
  schwarzschildGeodesicRHS,
  schwarzschildRadius,
  semfBindingEnergy,
  semfBindingPerNucleon,
  semfStabilityGradient,
  singletCorrelation,
  solveKepler,
  stepKerrEquatorialGeodesic,
  stepLorenzRK4,
  stepSchwarzschildGeodesic,
  timeToMerger,
  titrationPH,
  visVivaSpeed
};

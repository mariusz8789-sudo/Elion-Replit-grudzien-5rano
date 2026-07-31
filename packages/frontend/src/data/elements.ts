/**
 * 118 pierwiastków: symbol, nazwa polska, masa atomowa (u, zaokrąglona).
 * Dla pierwiastków bez stabilnych izotopów podano masę najtrwalszego izotopu.
 */

const RAW =
  'H,Wodór,1.008|He,Hel,4.003|Li,Lit,6.94|Be,Beryl,9.012|B,Bor,10.81|C,Węgiel,12.011|N,Azot,14.007|O,Tlen,15.999|F,Fluor,18.998|Ne,Neon,20.18|' +
  'Na,Sód,22.99|Mg,Magnez,24.305|Al,Glin,26.982|Si,Krzem,28.085|P,Fosfor,30.974|S,Siarka,32.06|Cl,Chlor,35.45|Ar,Argon,39.95|K,Potas,39.098|Ca,Wapń,40.078|' +
  'Sc,Skand,44.956|Ti,Tytan,47.867|V,Wanad,50.942|Cr,Chrom,51.996|Mn,Mangan,54.938|Fe,Żelazo,55.845|Co,Kobalt,58.933|Ni,Nikiel,58.693|Cu,Miedź,63.546|Zn,Cynk,65.38|' +
  'Ga,Gal,69.723|Ge,German,72.63|As,Arsen,74.922|Se,Selen,78.971|Br,Brom,79.904|Kr,Krypton,83.798|Rb,Rubid,85.468|Sr,Stront,87.62|Y,Itr,88.906|Zr,Cyrkon,91.224|' +
  'Nb,Niob,92.906|Mo,Molibden,95.95|Tc,Technet,98|Ru,Ruten,101.07|Rh,Rod,102.906|Pd,Pallad,106.42|Ag,Srebro,107.868|Cd,Kadm,112.414|In,Ind,114.818|Sn,Cyna,118.71|' +
  'Sb,Antymon,121.76|Te,Tellur,127.6|I,Jod,126.904|Xe,Ksenon,131.293|Cs,Cez,132.905|Ba,Bar,137.327|La,Lantan,138.905|Ce,Cer,140.116|Pr,Prazeodym,140.908|Nd,Neodym,144.242|' +
  'Pm,Promet,145|Sm,Samar,150.36|Eu,Europ,151.964|Gd,Gadolin,157.25|Tb,Terb,158.925|Dy,Dysproz,162.5|Ho,Holm,164.93|Er,Erb,167.259|Tm,Tul,168.934|Yb,Iterb,173.045|' +
  'Lu,Lutet,174.967|Hf,Hafn,178.486|Ta,Tantal,180.948|W,Wolfram,183.84|Re,Ren,186.207|Os,Osm,190.23|Ir,Iryd,192.217|Pt,Platyna,195.084|Au,Złoto,196.967|Hg,Rtęć,200.592|' +
  'Tl,Tal,204.38|Pb,Ołów,207.2|Bi,Bizmut,208.98|Po,Polon,209|At,Astat,210|Rn,Radon,222|Fr,Frans,223|Ra,Rad,226|Ac,Aktyn,227|Th,Tor,232.038|' +
  'Pa,Protaktyn,231.036|U,Uran,238.029|Np,Neptun,237|Pu,Pluton,244|Am,Ameryk,243|Cm,Kiur,247|Bk,Berkel,247|Cf,Kaliforn,251|Es,Einstein,252|Fm,Ferm,257|' +
  'Md,Mendelew,258|No,Nobel,259|Lr,Lorens,266|Rf,Rutherford,267|Db,Dubn,268|Sg,Seaborg,269|Bh,Bohr,270|Hs,Has,271|Mt,Meitner,278|Ds,Darmsztadt,281|' +
  'Rg,Roentgen,282|Cn,Kopernik,285|Nh,Nihon,286|Fl,Flerow,289|Mc,Moskow,290|Lv,Liwermor,293|Ts,Tenes,294|Og,Oganeson,294';

export interface ElementInfo {
  z: number;
  symbol: string;
  name: string;
  mass: number;
  /** Pozycja w siatce 18-kolumnowej (kolumna 1-18, wiersz 1-9; 8-9 = f-blok). */
  col: number;
  row: number;
  /** Elektrony na powłokach (model powłokowy wg reguły Aufbau — uproszczenie). */
  shells: number[];
}

/** Kolejność Aufbau: [n powłoki, pojemność podpowłoki]. */
const AUFBAU: [number, number][] = [
  [1, 2], [2, 2], [2, 6], [3, 2], [3, 6], [4, 2], [3, 10], [4, 6], [5, 2], [4, 10],
  [5, 6], [6, 2], [4, 14], [5, 10], [6, 6], [7, 2], [5, 14], [6, 10], [7, 6],
];

function shellsFor(z: number): number[] {
  const shells: number[] = [];
  let left = z;
  for (const [n, cap] of AUFBAU) {
    if (left <= 0) break;
    const take = Math.min(left, cap);
    shells[n - 1] = (shells[n - 1] ?? 0) + take;
    left -= take;
  }
  return shells.map((s) => s ?? 0);
}

function positionFor(z: number): { col: number; row: number } {
  if (z === 1) return { col: 1, row: 1 };
  if (z === 2) return { col: 18, row: 1 };
  if (z <= 4) return { col: z - 2, row: 2 };
  if (z <= 10) return { col: z + 8, row: 2 };
  if (z <= 12) return { col: z - 10, row: 3 };
  if (z <= 18) return { col: z, row: 3 };
  if (z <= 36) return { col: z - 18, row: 4 };
  if (z <= 54) return { col: z - 36, row: 5 };
  if (z <= 56) return { col: z - 54, row: 6 };
  if (z <= 71) return { col: z - 54, row: 8 }; // lantanowce (wiersz wydzielony)
  if (z <= 86) return { col: z - 68, row: 6 };
  if (z <= 88) return { col: z - 86, row: 7 };
  if (z <= 103) return { col: z - 86, row: 9 }; // aktynowce
  return { col: z - 100, row: 7 };
}

export const ELEMENTS: ElementInfo[] = RAW.split('|').map((entry, i) => {
  const [symbol, name, mass] = entry.split(',');
  const z = i + 1;
  return { z, symbol, name, mass: Number(mass), ...positionFor(z), shells: shellsFor(z) };
});

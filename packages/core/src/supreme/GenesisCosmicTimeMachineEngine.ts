import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export type ClaimStatus = 'SCIENCE_BASED' | 'SPECULATIVE_FICTION' | 'UNSUBSTANTIATED_CLAIM';
export type CosmicDestination = 'EARTH_MALL_2029' | 'MOON_BASE_ALPHA' | 'NIBIRU_PRIME' | 'MILKY_WAY_DEEP_SPACE' | 'CUSTOM_DATE';
export const DESTINATION_CLAIM: Record<CosmicDestination, ClaimStatus> = { EARTH_MALL_2029: 'SPECULATIVE_FICTION', MOON_BASE_ALPHA: 'SPECULATIVE_FICTION', NIBIRU_PRIME: 'UNSUBSTANTIATED_CLAIM', MILKY_WAY_DEEP_SPACE: 'SCIENCE_BASED', CUSTOM_DATE: 'SPECULATIVE_FICTION' };
export const FICTION_DISCLAIMER = '[DISCLAIMER] Fikcja / symulacja syntetyczna (SYNTHETIC_CINEMATIC). To nie jest nagranie z przyszłości ani realne miejsce.';
export interface TimeMachineRequest { readonly targetDateIso: string; readonly destination: CosmicDestination; readonly timeDilationFactor: number; readonly darkMatterIndex: number; }
export interface FrozenAgent { readonly agentId: string; readonly posX: number; readonly posY: number; readonly posZ: number; readonly actionPose: 'WALKING' | 'LOOKING_UP' | 'HOLDING_PHONE' | 'STARTLED'; readonly outfitColor: string; }
export interface FrozenVehicle { readonly vehicleId: string; readonly model: string; readonly posX: number; readonly posY: number; readonly posZ: number; readonly speedKmh: number; readonly slideVector: readonly [number, number, number]; }
export interface CosmicSkyboxConfig { readonly stellarDensity: number; readonly galaxyArmCount: number; readonly nebulaTintHex: string; readonly moonVisible: boolean; readonly nibiruProximityKm: number; readonly claimStatus: ClaimStatus; }
export interface TimeMachineSimulationPackage { readonly packageId: string; readonly request: TimeMachineRequest; readonly skybox: CosmicSkyboxConfig; readonly frozenCrowd: readonly FrozenAgent[]; readonly frozenVehicle: FrozenVehicle; readonly bulletTimeActive: boolean; readonly tiktokScript: readonly string[]; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly fingerprint: string; readonly issuedAt: number; }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export class GenesisCosmicTimeMachineEngine {
  constructor(private clock: Clock, private seed: number) {}
  resolveSkybox(destination: CosmicDestination): CosmicSkyboxConfig {
    const claim = DESTINATION_CLAIM[destination];
    switch (destination) {
      case 'NIBIRU_PRIME': return { stellarDensity: 0.95, galaxyArmCount: 4, nebulaTintHex: '#ff3366', moonVisible: true, nibiruProximityKm: 142000, claimStatus: claim };
      case 'MOON_BASE_ALPHA': return { stellarDensity: 0.90, galaxyArmCount: 2, nebulaTintHex: '#112244', moonVisible: false, nibiruProximityKm: 0, claimStatus: claim };
      case 'MILKY_WAY_DEEP_SPACE': return { stellarDensity: 1.0, galaxyArmCount: 5, nebulaTintHex: '#00ffcc', moonVisible: false, nibiruProximityKm: 0, claimStatus: claim };
      case 'EARTH_MALL_2029': default: return { stellarDensity: 0.60, galaxyArmCount: 2, nebulaTintHex: '#0a1f16', moonVisible: true, nibiruProximityKm: 0, claimStatus: claim };
    }
  }
  generateFrozenScene(seedOverride: number): { crowd: readonly FrozenAgent[]; vehicle: FrozenVehicle } {
    const rng = mulberry32(seedOverride ^ this.seed);
    const poses: FrozenAgent['actionPose'][] = ['WALKING', 'LOOKING_UP', 'HOLDING_PHONE', 'STARTLED'];
    const colors = ['#00ff9c', '#38bdf8', '#c9a227', '#ff2d78', '#a78bfa'];
    const crowd: FrozenAgent[] = Array.from({ length: 10 }, (_, i) => ({ agentId: `AGENT-${i + 1}`, posX: +((rng() - 0.5) * 16).toFixed(2), posY: 0, posZ: +((rng() - 0.5) * 20).toFixed(2), actionPose: poses[Math.floor(rng() * poses.length)], outfitColor: colors[Math.floor(rng() * colors.length)] }));
    return { crowd, vehicle: { vehicleId: 'VEH-EV-2029', model: 'Genesis CyberLux 5D', posX: 0, posY: 0.5, posZ: -8.0, speedKmh: 65.0, slideVector: [0.0, 0.0, 1.2] } };
  }
  generateTikTokScript(destination: CosmicDestination, targetDate: string): readonly string[] {
    let lines: string[];
    switch (destination) {
      case 'NIBIRU_PRIME': lines = [`[0:00] "Wpisałem datę ${targetDate} i 'przeniosłem się' na Nibiru (motyw fikcyjny)."`, `[0:03] "Spójrzcie na to niebo – czerwona mgławica i gigantyczna planeta na horyzoncie."`, `[0:07] "Zatrzymuję czas w trybie Bullet-Time. Mogę podejść do każdego obiektu."`, `[0:12] "Obserwujcie kwantową anomalię grawitacyjną – czysta matematyka, zero losowości."`]; break;
      case 'MOON_BASE_ALPHA': lines = [`[0:00] "Księżyc, rok ${targetDate}. Patrzymy stąd na Ziemię."`, `[0:04] "Wszystko zamrożone w kadrze w jakości Matrixa."`, `[0:08] "Obserwator może swobodnie spacerować po bazie. Zero losowości, czysta matematyka."`]; break;
      case 'MILKY_WAY_DEEP_SPACE': lines = [`[0:00] "Głęboka przestrzeń Drogi Mlecznej, rok ${targetDate}."`, `[0:04] "Ramiona galaktyczne i mgławice renderowane proceduralnie z seeda."`, `[0:08] "Bullet-Time: czas zatrzymany, kamera płynie przez gwiazdy."`]; break;
      case 'EARTH_MALL_2029': default: lines = [`[0:00] "Warszawa / Nowy Jork, rok ${targetDate}. Galeria przyszłości."`, `[0:03] "Jedzie auto, 10 osób w tłumie... i wciskam PAUZĘ."`, `[0:06] "Wchodzimy w tryb Bullet-Time. Zobacz te odbicia chromu i padający deszcz kodowy."`, `[0:10] "Obserwuj niebo nad galerią – otwiera się widok na Drogę Mleczną."`]; break;
    }
    return [...lines, FICTION_DISCLAIMER];
  }
  launchTimeMachine(req: TimeMachineRequest): TimeMachineSimulationPackage {
    if (!ISO_DATE.test(req.targetDateIso)) throw new Error('INVALID_DATE: expected YYYY-MM-DD, got ' + req.targetDateIso);
    const skybox = this.resolveSkybox(req.destination);
    const sceneData = this.generateFrozenScene(req.timeDilationFactor === 0 ? 999 : 123);
    const tiktokScript = this.generateTikTokScript(req.destination, req.targetDateIso);
    const partial = { packageId: 'TM-' + sha256hex(req.targetDateIso + req.destination).slice(0, 12), request: req, skybox, frozenCrowd: sceneData.crowd, frozenVehicle: sceneData.vehicle, bulletTimeActive: req.timeDilationFactor === 0, tiktokScript, dataLabel: 'SYNTHETIC_CINEMATIC' as const };
    const fingerprint = sha256hex(stableStringify(partial));
    return { ...partial, fingerprint, issuedAt: this.clock.now() };
  }
}

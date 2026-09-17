/* Proprietary / All Rights Reserved - Genesis OS */
import React, { createContext, useContext, useMemo, useRef } from 'react';
import { generateCity } from '@genesis/core/city-enterprise/GenesisCityGenerator.js';
import { buildMolecule } from '@genesis/core/quantum-lab/GenesisQuantumSandbox.js';

export class DeterministicSimClock {
  private elapsed = 0;
  tick(milliseconds: number): void { this.elapsed += milliseconds / 1000; }
  get t(): number { return this.elapsed; }
}

const seed = 20260917;
const value = {
  clock: new DeterministicSimClock(),
  seed,
  urban: { pipeline: (_prompt: string, citySeed: number) => ({ grid: generateCity(citySeed, 'WARSAW') }) },
  quantum: { visualizationParams: (_id: string) => ({ spin: 0.3 }) },
};
const EngineContext = createContext(value);
export function GenesisEngineProvider({ children }: { readonly children: React.ReactNode }): React.ReactElement { const stable = useRef(value).current; useMemo(() => buildMolecule(stable.seed), [stable]); return <EngineContext.Provider value={stable}>{children}</EngineContext.Provider>; }
export function useGenesisEngine(): typeof value { return useContext(EngineContext); }

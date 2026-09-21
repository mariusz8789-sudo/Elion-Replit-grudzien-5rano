import { useState } from 'react';
import { GenesisCanvas, type GenesisMode } from './GenesisCanvas';
import { GenesisHUD } from './GenesisHUD';

function modeForPrompt(prompt: string): GenesisMode {
  const value = prompt.toLowerCase();
  if (/(city|miasto|urban|building|street)/.test(value)) return 'city';
  if (/(epidemic|epidemia|r0|infection|virus|spread)/.test(value)) return 'epidemic';
  if (/(quantum|tesseract|5d|4d|dimension|tensor)/.test(value)) return 'quantum';
  return 'matrix';
}

export function GenesisEngineApp({ routeLabel = 'GENESIS COMMAND CENTER' }: { routeLabel?: string }): JSX.Element {
  const [prompt, setPrompt] = useState('');
  let promptSeed = 2166136261;
  for (let i = 0; i < prompt.length; i += 1) promptSeed = Math.imul(promptSeed ^ prompt.charCodeAt(i), 16777619) >>> 0;
  return <div className="genesis-engine-app"><GenesisCanvas promptSeed={promptSeed} mode={modeForPrompt(prompt)} /><GenesisHUD routeLabel={routeLabel} onPrompt={setPrompt} /></div>;
}

export default GenesisEngineApp;

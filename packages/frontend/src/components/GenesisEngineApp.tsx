import { useState } from 'react';
import { GenesisCanvas } from './GenesisCanvas';
import { GenesisHUD } from './GenesisHUD';

export function GenesisEngineApp({ routeLabel = 'GENESIS COMMAND CENTER' }: { routeLabel?: string }): JSX.Element {
  const [prompt, setPrompt] = useState('');
  let promptSeed = 0;
  for (let i = 0; i < prompt.length; i += 1) promptSeed = Math.imul(promptSeed ^ prompt.charCodeAt(i), 16777619) >>> 0;
  return (
    <div className="genesis-engine-app">
      <GenesisCanvas promptSeed={promptSeed} />
      <GenesisHUD routeLabel={routeLabel} onPrompt={setPrompt} />
    </div>
  );
}

export default GenesisEngineApp;

import { useState } from 'react';
import { GenesisCanvas } from './GenesisCanvas';
import { GenesisHUD } from './GenesisHUD';

export function GenesisEngineApp({ routeLabel = 'GENESIS ENGINE', onExit }: { routeLabel?: string; onExit?: () => void }): JSX.Element {
  const [paused, setPaused] = useState(false);
  return (
    <div className="genesis-engine-app">
      <GenesisCanvas paused={paused} />
      <GenesisHUD routeLabel={routeLabel} paused={paused} onTogglePaused={() => setPaused((value) => !value)} onExit={onExit} />
    </div>
  );
}

export default GenesisEngineApp;

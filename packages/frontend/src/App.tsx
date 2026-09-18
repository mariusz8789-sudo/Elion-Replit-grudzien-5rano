import { useEffect, useState } from 'react';
import { GenesisEngineApp } from './components/GenesisEngineApp';

export function cleanRouteTitle(title: string): string { return title.replace(/^[^\p{L}\p{N}]+\s*/u, '').trim(); }

export default function App(): JSX.Element {
  const [route, setRoute] = useState(() => window.location.hash || '#/');
  useEffect(() => { const onHash = () => setRoute(window.location.hash || '#/'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  const label = route === '#/' ? 'GENESIS COMMAND CENTER' : `GENESIS · ${route.slice(2).replaceAll('-', ' ').toUpperCase()}`;
  return <GenesisEngineApp routeLabel={label} />;
}

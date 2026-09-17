import { useEffect, useState } from 'react';
import { GenesisEngineApp } from './components/GenesisEngineApp';

export function cleanRouteTitle(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+\s*/u, '').trim();
}

/** Hard root override: every route is intentionally rendered by Genesis Engine. */
export default function App(): JSX.Element {
  const [route, setRoute] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const label = route === '#/' ? 'GENESIS COMMAND CENTER' : `GENESIS · ${route.slice(2).replaceAll('-', ' ').toUpperCase()}`;
  return <GenesisEngineApp routeLabel={label} />;
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { t } from './core/i18n';
import './styles.css';
import './styles-2040.css';
import './styles-2040-screens.css';
import './styles-2040-hud.css';
import './styles-investor-polish.css';
import './components/genesis-ui/worldViewShell.css';

// Deep links by path (`/matrix`, as the Playwright specs and external links use) are served
// by the backend's SPA fallback; the router is hash-based, so map the path onto the hash
// once, before the first render. `/` and any URL that already has a hash are untouched.
if (window.location.pathname !== '/' && !window.location.hash) {
  window.history.replaceState(null, '', `/#${window.location.pathname}${window.location.search}`);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <a href="#main-content" className="skip-link">{t('skipLink')}</a>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// PWA: service worker tylko w buildzie produkcyjnym (w dev przeszkadza HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* brak SW nie psuje aplikacji */
    });
  });
}

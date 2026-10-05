import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrintProvider } from './print/PrintProvider';
import { registerServiceWorker } from './pwa';
import './theme/theme.css';
import './print/print.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// Installability, not offline: see `pwa.ts` and `public/sw.js`. Registered
// before the render call but deferred to `load` inside, so it never competes
// with first paint.
registerServiceWorker();

createRoot(container).render(
  <React.StrictMode>
    {/* The outermost net: a throw above the router (auth bootstrap, theme,
        the router itself) would otherwise leave a blank document. */}
    <ErrorBoundary>
      {/* Above the router so any page can print, and so the printable document
          is a sibling of the app rather than a child of a page that may
          unmount mid-dialog. */}
      <PrintProvider>
        <App />
      </PrintProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

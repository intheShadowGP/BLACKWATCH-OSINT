import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import 'leaflet/dist/leaflet.css';
import { App } from '@/app/App';
import { settingsStore } from '@/services/privacy/store';
import { engine } from '@/services/automation/engine';
import { hydrateRateLimits } from '@/services/adapters/http';

async function boot() {
  try {
    await settingsStore.load();
    await engine.hydrate();
    await hydrateRateLimits();
  } catch (e) {
    // IndexedDB may be unavailable (private mode in some browsers): the app
    // still renders and shows a storage warning on the dashboard.
    console.error('storage init failed', e);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();

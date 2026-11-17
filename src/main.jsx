import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider } from './context/StoreContext.jsx';
import { API_URL, API_ERROR } from './core/config.js';
import { migrateLegacyHash } from './core/legacyHash.js';
import { siteConfig } from './config/index.js';
import './styles/app.css';

// Keep old links (#product/P123, #cart ...) working after the move to #/product/P123.
const migrated = migrateLegacyHash(window.location.hash);
if (migrated) window.location.replace(window.location.pathname + window.location.search + migrated);

if (API_ERROR) console.error(API_ERROR);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider apiUrl={API_URL} config={siteConfig}>
      <App />
    </StoreProvider>
  </StrictMode>
);

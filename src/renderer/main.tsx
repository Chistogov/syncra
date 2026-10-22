import React from 'react';
import ReactDOM from 'react-dom/client';
import './api/browser-adapter';
import { LanguageProvider } from './context/LanguageContext';
import { ConfirmProvider } from './context/ConfirmContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </LanguageProvider>
  </React.StrictMode>
);

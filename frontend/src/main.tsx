import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

const isLight = localStorage.getItem('creode_light') === '1';
const isZh = (localStorage.getItem('creode_lang') || 'zh-TW') === 'zh-TW';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: isLight ? '#ffffff' : '#1a1a24',
              color: isLight ? '#1e293b' : '#ffffff',
              border: isLight ? '1px solid #e2e8f0' : '1px solid #2a2a3a',
            },
            success: {
              iconTheme: {
                primary: isLight ? '#16a34a' : '#22c55e',
                secondary: isLight ? '#ffffff' : '#1a1a24',
              },
            },
            error: {
              iconTheme: {
                primary: isLight ? '#dc2626' : '#ef4444',
                secondary: isLight ? '#ffffff' : '#1a1a24',
              },
            },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
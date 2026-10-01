import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ManagementApp from './App';
import EmployeeApp from './EmployeeApp';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { SettingsProvider } from './context/SettingsContext';

const App = import.meta.env.VITE_APP_SURFACE === 'employee'
  ? EmployeeApp
  : ManagementApp;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </SettingsProvider>
  </React.StrictMode>
);

// Register the service worker so the app is installable / runs standalone.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

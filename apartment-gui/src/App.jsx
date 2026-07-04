import React, { useState, useEffect } from 'react';
import { initDb } from './db';
import Dashboard from './Dashboard';
import Ledger from './Ledger';
import CSVImport from './CSVImport';
import Settings from './Settings';
import Residents from './Residents';
import GenerateDues from './GenerateDues';
import TopupsHistory from './TopupsHistory';
import './App.css';
import { Sun, Moon, Contrast, Type } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState('16px');
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    initDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error(err);
        setDbError(String(err));
      });
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'high-contrast' : 'light');
  };

  const changeFontSize = (delta) => {
    setFontSize(prev => {
      const current = parseInt(prev);
      return Math.min(Math.max(current + delta, 12), 24) + 'px';
    });
  };

  if (dbError) {
    return <div className="skeleton-loader full-screen" style={{color: 'red', padding: '2rem'}}>
      <h2>Database Error</h2>
      <p>{dbError}</p>
      <p>Did you restart the Tauri dev server after the SQLite plugin was configured?</p>
    </div>;
  }

  if (!dbReady) {
    return <div className="skeleton-loader full-screen">Loading Database...</div>;
  }

  return (
    <div className={`app-container theme-${theme}`} style={{ fontSize }}>
      <header className="app-header">
        <div className="logo">Apartment Manager Pro</div>
        <nav>
          <button className={currentTab === 'dashboard' ? 'active' : ''} onClick={() => setCurrentTab('dashboard')}>Dashboard</button>
          <button className={currentTab === 'ledger' ? 'active' : ''} onClick={() => setCurrentTab('ledger')}>Ledger</button>
          <button className={currentTab === 'transactions' ? 'active' : ''} onClick={() => setCurrentTab('transactions')}>Transactions</button>
          <button className={currentTab === 'import' ? 'active' : ''} onClick={() => setCurrentTab('import')}>CSV Import</button>
          <button className={currentTab === 'apartments' ? 'active' : ''} onClick={() => setCurrentTab('apartments')}>Apartments</button>
          <button className={currentTab === 'generate' ? 'active' : ''} onClick={() => setCurrentTab('generate')}>Generate Dues</button>
          <button className={currentTab === 'settings' ? 'active' : ''} onClick={() => setCurrentTab('settings')}>Settings</button>
        </nav>
        <div className="controls">
          <button className="icon-btn" onClick={() => changeFontSize(-2)}><Type size={14}/>-</button>
          <button className="icon-btn" onClick={() => changeFontSize(2)}><Type size={18}/>+</button>
          <button className="icon-btn" onClick={toggleTheme}>
            {theme === 'light' ? <Sun size={18}/> : theme === 'dark' ? <Moon size={18}/> : <Contrast size={18}/>}
          </button>
        </div>
      </header>
      <main className="app-content">
        {currentTab === 'dashboard' && <Dashboard />}
        {currentTab === 'ledger' && <Ledger />}
        {currentTab === 'transactions' && <TopupsHistory />}
        {currentTab === 'import' && <CSVImport />}
        {currentTab === 'apartments' && <Residents />}
        {currentTab === 'generate' && <GenerateDues />}
        {currentTab === 'settings' && <Settings />}
      </main>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--card-bg)', color: 'var(--text-color)' } }} />
    </div>
  );
}

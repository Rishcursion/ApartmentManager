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
import {
  Building2,
  CalendarPlus,
  Contrast,
  LayoutDashboard,
  Moon,
  ReceiptText,
  Settings as SettingsIcon,
  Sun,
  Type,
  Upload,
  WalletCards
} from 'lucide-react';
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ledger', label: 'Ledger', icon: ReceiptText },
    { id: 'transactions', label: 'Transactions', icon: WalletCards },
    { id: 'import', label: 'CSV Import', icon: Upload },
    { id: 'apartments', label: 'Apartments', icon: Building2 },
    { id: 'generate', label: 'Generate Dues', icon: CalendarPlus },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

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
      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">AM</div>
          <div>
            <div className="logo">Apartment Manager</div>
            <div className="brand-subtitle">Society finance desk</div>
          </div>
        </div>
        <nav className="side-nav" aria-label="Primary navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={currentTab === item.id ? 'active' : ''}
                onClick={() => setCurrentTab(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="icon-btn" onClick={() => changeFontSize(-2)} title="Decrease font size"><Type size={14}/><span>A-</span></button>
          <button className="icon-btn" onClick={() => changeFontSize(2)} title="Increase font size"><Type size={18}/><span>A+</span></button>
          <button className="icon-btn" onClick={toggleTheme} title="Cycle theme">
            {theme === 'light' ? <Sun size={18}/> : theme === 'dark' ? <Moon size={18}/> : <Contrast size={18}/>}
          </button>
        </div>
      </aside>
      <main className="app-content">
        <div className="content-shell">
          {currentTab === 'dashboard' && <Dashboard />}
          {currentTab === 'ledger' && <Ledger />}
          {currentTab === 'transactions' && <TopupsHistory />}
          {currentTab === 'import' && <CSVImport />}
          {currentTab === 'apartments' && <Residents />}
          {currentTab === 'generate' && <GenerateDues />}
          {currentTab === 'settings' && <Settings />}
        </div>
      </main>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--card-bg)', color: 'var(--text-color)' } }} />
    </div>
  );
}

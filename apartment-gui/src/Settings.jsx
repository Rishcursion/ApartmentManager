import React, { useState, useEffect } from 'react';
import { DEFAULT_APARTMENT_LAYOUT, getApartmentLayout, getDb, saveApartmentLayout } from './db';
import toast from 'react-hot-toast';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('categories'); // 'categories', 'layout', 'danger'
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('Monthly');
  const [isVariable, setIsVariable] = useState(false);
  const [layoutJson, setLayoutJson] = useState(JSON.stringify(DEFAULT_APARTMENT_LAYOUT, null, 2));
  const [isAdvancedLayout, setIsAdvancedLayout] = useState(false);
  const [showDangerModal, setShowDangerModal] = useState(false);

  useEffect(() => {
    loadCategories();
    loadApartmentLayout();
  }, []);

  const loadCategories = async () => {
    const db = await getDb();
    try {
      const result = await db.select("SELECT * FROM fee_categories");
      setCategories(result);
    } catch (e) {
      console.error(e);
      toast.error("Error loading categories");
    }
  };

  const loadApartmentLayout = async () => {
    try {
      const layout = await getApartmentLayout();
      setLayoutJson(JSON.stringify(layout, null, 2));
    } catch (e) {
      console.error(e);
      toast.error("Error loading apartment layout");
    }
  };

  const updateApartmentLayout = async (e) => {
    if (e) e.preventDefault();
    try {
      const parsed = JSON.parse(layoutJson);
      if (!Array.isArray(parsed)) {
        toast.error("Layout must be a JSON array.");
        return;
      }
      await saveApartmentLayout(parsed);
      setLayoutJson(JSON.stringify(parsed, null, 2));
      toast.success("Apartment layout saved and synced");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof SyntaxError ? "Invalid JSON layout." : `Error saving layout: ${e.message}`);
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    const finalAmount = isVariable ? 0 : parseFloat(amount);
    if (!name || (!isVariable && !amount)) return;
    try {
      const db = await getDb();
      await db.execute("INSERT INTO fee_categories (name, type, amount, archived, is_variable) VALUES (?, ?, ?, 0, ?)", [name, type, finalAmount, isVariable ? 1 : 0]);
      setName('');
      setAmount('');
      setType('Monthly');
      setIsVariable(false);
      toast.success("Category added successfully");
      loadCategories();
    } catch (e) {
      toast.error("Error adding category");
      console.error(e);
    }
  };

  const toggleArchive = async (id, currentStatus) => {
    try {
      const db = await getDb();
      const newStatus = currentStatus === 1 ? 0 : 1;
      await db.execute("UPDATE fee_categories SET archived = ? WHERE id = ?", [newStatus, id]);
      toast.success(newStatus === 1 ? "Category archived" : "Category restored");
      loadCategories();
    } catch (e) {
      toast.error("Error toggling category archive");
      console.error(e);
    }
  };

  const confirmFactoryReset = async () => {
    setShowDangerModal(false);
    const db = await getDb();
    try {
      await db.execute('PRAGMA foreign_keys = OFF');
      await db.execute('DROP TABLE IF EXISTS topups');
      await db.execute('DROP TABLE IF EXISTS receipts');
      await db.execute('DROP TABLE IF EXISTS dues');
      await db.execute('DROP TABLE IF EXISTS fee_categories');
      await db.execute('DROP TABLE IF EXISTS residents');
      await db.execute('DROP TABLE IF EXISTS app_settings');
      await db.execute('PRAGMA foreign_keys = ON');
      toast.success("Database wiped. The app will now reload to re-initialize an empty database.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error(e);
      toast.error("Error wiping database.");
    }
  };

  // Minimal visual editor parsing
  let visualBlocks = [];
  try {
    const parsed = JSON.parse(layoutJson);
    if (Array.isArray(parsed)) {
      visualBlocks = parsed.map(b => {
        let from = 1, to = 10, pad = 0;
        if (b.ranges && b.ranges.length > 0) {
          const r = b.ranges[0];
          if (Array.isArray(r)) { from = r[0]; to = r[1]; }
          else { from = r.from; to = r.to; pad = r.pad || 0; }
        }
        return { block: b.block, from, to, pad };
      });
    }
  } catch (e) {}

  const updateVisualBlock = (index, field, value) => {
    const newBlocks = [...visualBlocks];
    newBlocks[index][field] = value;
    const newJson = newBlocks.map(b => ({
      block: b.block,
      ranges: [{ from: Number(b.from), to: Number(b.to), pad: Number(b.pad) }]
    }));
    setLayoutJson(JSON.stringify(newJson, null, 2));
  };

  const addVisualBlock = () => {
    const newBlocks = [...visualBlocks, { block: 'New', from: 1, to: 10, pad: 0 }];
    const newJson = newBlocks.map(b => ({
      block: b.block,
      ranges: [{ from: Number(b.from), to: Number(b.to), pad: Number(b.pad) }]
    }));
    setLayoutJson(JSON.stringify(newJson, null, 2));
  };

  const removeVisualBlock = (index) => {
    const newBlocks = visualBlocks.filter((_, i) => i !== index);
    const newJson = newBlocks.map(b => ({
      block: b.block,
      ranges: [{ from: Number(b.from), to: Number(b.to), pad: Number(b.pad) }]
    }));
    setLayoutJson(JSON.stringify(newJson, null, 2));
  };

  return (
    <div className="settings w-full">
      <div className="dashboard-header mb-1">
        <h2 className="section-title">Settings</h2>
      </div>

      <div className="tabs flex-row gap-1 mb-2" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button className={`tab-btn ${activeTab === 'categories' ? 'primary-btn' : 'secondary-btn'}`} onClick={() => setActiveTab('categories')}>Fee Categories</button>
        <button className={`tab-btn ${activeTab === 'layout' ? 'primary-btn' : 'secondary-btn'}`} onClick={() => setActiveTab('layout')}>Apartment Layout</button>
        <button className={`tab-btn ${activeTab === 'danger' ? 'primary-btn' : 'secondary-btn'}`} onClick={() => setActiveTab('danger')} style={activeTab === 'danger' ? {background: 'var(--error-color, #e74c3c)', borderColor: 'var(--error-color, #e74c3c)', color: 'white'} : {}}>Danger Zone</button>
      </div>
      
      {activeTab === 'categories' && (
        <div className="tab-content">
          <div className="card">
            <h3>Add New Category</h3>
            <form onSubmit={addCategory} className="flex-row gap-1 flex-wrap mt-1">
              <input type="text" placeholder="e.g. Water Bill" value={name} onChange={e => setName(e.target.value)} required />
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="Monthly">Monthly</option>
                <option value="Ad-Hoc">Ad-Hoc</option>
              </select>
              <label className="flex-row gap-05" style={{fontSize: '0.9em'}}>
                <input type="checkbox" checked={isVariable} onChange={e => {setIsVariable(e.target.checked); setAmount('');}} />
                Variable Charge
              </label>
              {!isVariable && (
                <input type="number" placeholder="Base Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} required />
              )}
              <button className="primary-btn" type="submit">Add Category</button>
            </form>
          </div>

          <div className="card mt-2 p-0">
            <h3 className="p-1" style={{borderBottom: '1px solid var(--border-color)'}}>Existing Categories</h3>
            <div className="table-scroll">
              <table>
                <thead className="sticky-header">
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Variable?</th>
                    <th className="money">Base Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id} className={cat.archived ? 'archived-row' : ''} style={{opacity: cat.archived ? 0.6 : 1}}>
                      <td>{cat.name}</td>
                      <td>{cat.type}</td>
                      <td>{cat.is_variable === 1 ? 'Yes' : 'No'}</td>
                      <td className="money">{cat.is_variable === 1 ? 'N/A' : `₹${cat.amount}`}</td>
                      <td>{cat.archived ? 'Archived' : 'Active'}</td>
                      <td>
                        <button onClick={() => toggleArchive(cat.id, cat.archived)} className="action-btn">
                          {cat.archived ? 'Restore' : 'Archive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr><td colSpan="6" className="text-center p-2">No categories configured yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'layout' && (
        <div className="tab-content">
          <div className="card">
            <div className="flex-between mb-1">
              <h3>Apartment Layout</h3>
              <button className="secondary-btn" onClick={() => setIsAdvancedLayout(!isAdvancedLayout)}>
                {isAdvancedLayout ? 'Show Visual Builder' : 'Advanced JSON Editor'}
              </button>
            </div>
            
            {isAdvancedLayout ? (
              <form onSubmit={updateApartmentLayout} className="flex-col gap-1">
                <p>Configure blocks and flat numbers. Ranges can be arrays like <code>[1, 15]</code> or objects like <code>{'{"from":101,"to":120,"pad":4}'}</code>; use <code>flats</code> for non-sequential numbers.</p>
                <textarea
                  value={layoutJson}
                  onChange={e => setLayoutJson(e.target.value)}
                  rows={14}
                  spellCheck="false"
                  style={{fontFamily: 'monospace', padding: '0.75rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', width: '100%'}}
                />
                <button type="submit" className="primary-btn" style={{alignSelf: 'flex-start'}}>Save Apartment Layout</button>
              </form>
            ) : (
              <div className="flex-col gap-1">
                <p className="section-subtitle">Define the blocks and flat ranges in your society.</p>
                <div className="table-scroll">
                  <table>
                    <thead className="sticky-header">
                      <tr>
                        <th>Block Name</th>
                        <th>Start Flat No.</th>
                        <th>End Flat No.</th>
                        <th>Zero Padding</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visualBlocks.map((b, i) => (
                        <tr key={i}>
                          <td><input type="text" value={b.block} onChange={e => updateVisualBlock(i, 'block', e.target.value)} style={{width:'80px'}} /></td>
                          <td><input type="number" value={b.from} onChange={e => updateVisualBlock(i, 'from', e.target.value)} style={{width:'80px'}} /></td>
                          <td><input type="number" value={b.to} onChange={e => updateVisualBlock(i, 'to', e.target.value)} style={{width:'80px'}} /></td>
                          <td>
                            <select value={b.pad} onChange={e => updateVisualBlock(i, 'pad', e.target.value)}>
                              <option value={0}>None (1)</option>
                              <option value={2}>2 Digits (01)</option>
                              <option value={3}>3 Digits (001)</option>
                              <option value={4}>4 Digits (0001)</option>
                            </select>
                          </td>
                          <td><button className="action-btn" onClick={() => removeVisualBlock(i)} style={{color: 'var(--error-color, #e74c3c)'}}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex-row gap-1 mt-1">
                  <button className="secondary-btn" onClick={addVisualBlock}>+ Add Block</button>
                  <button className="primary-btn" onClick={updateApartmentLayout}>Save Apartment Layout</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'danger' && (
        <div className="tab-content">
          <div className="card" style={{ border: '1px solid var(--error-color, #e74c3c)', background: 'rgba(231, 76, 60, 0.05)' }}>
            <h3 style={{ color: 'var(--error-color, #e74c3c)' }}>Danger Zone</h3>
            <p className="mt-1 mb-1">Wipe the entire database to start over from scratch.</p>
            <button onClick={() => setShowDangerModal(true)} className="primary-btn" style={{ background: 'var(--error-color, #e74c3c)', borderColor: 'var(--error-color, #e74c3c)', color: 'white' }}>Factory Reset Database</button>
          </div>
        </div>
      )}

      {showDangerModal && (
        <div className="modal-overlay">
          <div className="modal card">
            <h3 style={{ color: 'var(--error-color, #e74c3c)' }}>Factory Reset</h3>
            <p className="mt-1">Are you SURE you want to delete ALL data? This will drop all tables and cannot be undone.</p>
            <div className="modal-actions mt-2">
              <button className="secondary-btn" onClick={() => setShowDangerModal(false)}>Cancel</button>
              <button className="primary-btn" style={{ background: 'var(--error-color, #e74c3c)', borderColor: 'var(--error-color, #e74c3c)', color: 'white' }} onClick={confirmFactoryReset}>Confirm Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

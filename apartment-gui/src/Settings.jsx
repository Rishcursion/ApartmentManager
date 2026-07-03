import React, { useState, useEffect } from 'react';
import { getDb } from './db';

export default function Settings() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('Monthly');
  const [isVariable, setIsVariable] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const db = await getDb();
    try {
      const result = await db.select("SELECT * FROM fee_categories");
      setCategories(result);
    } catch (e) {
      console.error(e);
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    const finalAmount = isVariable ? 0 : parseFloat(amount);
    if (!name || (!isVariable && !amount)) return;
    const db = await getDb();
    await db.execute("INSERT INTO fee_categories (name, type, amount, archived, is_variable) VALUES (?, ?, ?, 0, ?)", [name, type, finalAmount, isVariable ? 1 : 0]);
    setName('');
    setAmount('');
    setType('Monthly');
    setIsVariable(false);
    loadCategories();
  };

  const toggleArchive = async (id, currentStatus) => {
    const db = await getDb();
    const newStatus = currentStatus === 1 ? 0 : 1;
    await db.execute("UPDATE fee_categories SET archived = ? WHERE id = ?", [newStatus, id]);
    loadCategories();
  };

  const factoryReset = async () => {
    if (!window.confirm("Are you SURE you want to delete ALL data? This will drop all tables and cannot be undone.")) return;
    const db = await getDb();
    try {
      await db.execute('DROP TABLE IF EXISTS receipts');
      await db.execute('DROP TABLE IF EXISTS dues');
      await db.execute('DROP TABLE IF EXISTS fee_categories');
      await db.execute('DROP TABLE IF EXISTS residents');
      alert("Database wiped. The app will now reload to re-initialize an empty database.");
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("Error wiping database.");
    }
  };

  return (
    <div className="settings">
      <h2>Settings</h2>
      
      <div className="card">
        <h3>Add New Category</h3>
        <form onSubmit={addCategory} className="inline-form" style={{alignItems: 'center'}}>
          <input type="text" placeholder="e.g. Water Bill" value={name} onChange={e => setName(e.target.value)} required />
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="Monthly">Monthly</option>
            <option value="Ad-Hoc">Ad-Hoc</option>
          </select>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9em'}}>
            <input type="checkbox" checked={isVariable} onChange={e => {setIsVariable(e.target.checked); setAmount('');}} />
            Variable Charge
          </label>
          {!isVariable && (
            <input type="number" placeholder="Default/Base Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} required />
          )}
          <button className="primary-btn" type="submit">Add Category</button>
        </form>
      </div>

      <div className="card mt-2">
        <h3>Existing Categories</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Variable?</th>
              <th>Base Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} className={cat.archived ? 'archived-row' : ''}>
                <td>{cat.name}</td>
                <td>{cat.type}</td>
                <td>{cat.is_variable === 1 ? 'Yes' : 'No'}</td>
                <td>{cat.is_variable === 1 ? 'N/A' : `₹${cat.amount}`}</td>
                <td>{cat.archived ? 'Archived' : 'Active'}</td>
                <td>
                  <button onClick={() => toggleArchive(cat.id, cat.archived)} className="action-btn">
                    {cat.archived ? 'Restore' : 'Archive'}
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan="6">No categories configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card mt-2" style={{ border: '1px solid red', background: 'rgba(255, 0, 0, 0.05)' }}>
        <h3 style={{ color: 'red' }}>Danger Zone</h3>
        <p>Wipe the entire database to start over from scratch.</p>
        <button onClick={factoryReset} className="primary-btn" style={{ background: 'red', borderColor: 'red' }}>Factory Reset Database</button>
      </div>
    </div>
  );
}

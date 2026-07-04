import React, { useState, useEffect } from 'react';
import { getDb, withTransaction } from './db';
import toast from 'react-hot-toast';

export default function GenerateDues() {
  const [categories, setCategories] = useState([]);
  const [residents, setResidents] = useState([]);
  
  const [selectedCategory, setSelectedCategory] = useState('');
  const [targetType, setTargetType] = useState('ALL'); // ALL or SPECIFIC
  const [selectedFlat, setSelectedFlat] = useState('');
  const [month, setMonth] = useState('');
  const [fiscalYear, setFiscalYear] = useState('2026-27');
  
  const [variableAmounts, setVariableAmounts] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const db = await getDb();
      const cats = await db.select("SELECT * FROM fee_categories WHERE archived = 0");
      setCategories(cats);
      if (cats.length > 0) setSelectedCategory(cats[0].id);

      const res = await db.select("SELECT * FROM residents WHERE archived = 0 ORDER BY block, CAST(flat_no AS INTEGER)");
      setResidents(res);
    } catch (e) {
      console.error("Error loading master data in GenerateDues:", e);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedCategory || !month || !fiscalYear) return;
    
    const category = categories.find(c => c.id.toString() === selectedCategory.toString());
    if (!category) return;

    let targets = [];
    if (targetType === 'ALL') {
      targets = residents;
    } else {
      const specific = residents.find(r => r.id.toString() === selectedFlat.toString());
      if (specific) targets = [specific];
    }

    if (targets.length === 0) {
      toast.error("No apartments found to generate dues for.");
      return;
    }

    try {
      let inserted = 0;
      let skipped = 0;

      await withTransaction(async (tx) => {
        for (const res of targets) {
          const amountToCharge = category.is_variable === 1 ? (parseFloat(variableAmounts[res.id]) || 0) : category.amount;
          if (amountToCharge <= 0) continue;

          const existing = await tx.select(
            `SELECT id FROM dues
             WHERE resident_id = ? AND fee_category_id = ? AND month = ? AND fiscal_year = ?
             LIMIT 1`,
            [res.id, category.id, month, fiscalYear]
          );
          if (existing.length > 0) {
            skipped += 1;
            continue;
          }

          await tx.execute(
            "INSERT INTO dues (resident_id, fee_category_id, month, fiscal_year, amount, status) VALUES (?, ?, ?, ?, ?, 'Unpaid')",
            [res.id, category.id, month, fiscalYear, amountToCharge]
          );
          inserted += 1;
        }
      });

      if (inserted === 0 && skipped > 0) {
        toast.error(`No dues generated. ${skipped} existing due(s) already match ${month} ${fiscalYear}.`);
      } else {
        toast.success(`Generated dues for ${inserted} apartment(s).${skipped ? ` Skipped ${skipped} duplicate(s).` : ''}`);
      }
      setVariableAmounts({});
    } catch (e) {
      console.error(e);
      toast.error(`Error generating dues: ${e.message}`);
    }
  };

  const currentCat = categories.find(c => c.id.toString() === selectedCategory.toString());
  const isVariable = currentCat && currentCat.is_variable === 1;

  return (
    <div className="generate-dues">
      <h2>Generate Monthly / Ad-Hoc Dues</h2>
      
      <div className="card" style={{ maxWidth: '800px' }}>
        <p>Apply a standard charge to all apartments or a specific flat.</p>
        
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label>Fee Category (Due Head): </label><br/>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} required>
              {categories.length === 0 && <option value="">-- No Categories Found. Add them in Settings --</option>}
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} {c.is_variable === 1 ? '(Variable)' : `(₹${c.amount})`}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label>Month: </label><br/>
              <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} required>
                <option value="">Select Month</option>
                {['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="Ad-Hoc">Ad-Hoc / One-Time</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Fiscal Year: </label><br/>
              <input type="text" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} required />
            </div>
          </div>

          <div>
            <label>Target Apartments: </label><br/>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <label>
                <input type="radio" checked={targetType === 'ALL'} onChange={() => setTargetType('ALL')} />
                All Apartments
              </label>
              <label>
                <input type="radio" checked={targetType === 'SPECIFIC'} onChange={() => setTargetType('SPECIFIC')} />
                Specific Apartment
              </label>
            </div>
          </div>

          {targetType === 'SPECIFIC' && (
            <div>
              <label>Select Apartment: </label><br/>
              <select value={selectedFlat} onChange={e => setSelectedFlat(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} required={!isVariable || targetType === 'SPECIFIC'}>
                <option value="">Select...</option>
                {residents.map(r => (
                  <option key={r.id} value={r.id}>{r.block}-{r.flat_no} ({r.name})</option>
                ))}
              </select>
            </div>
          )}

          {isVariable && targetType === 'SPECIFIC' && selectedFlat && (
            <div>
              <label>Enter Amount for Selected Flat: </label>
              <input 
                type="number" 
                value={variableAmounts[selectedFlat] || ''} 
                onChange={(e) => setVariableAmounts({...variableAmounts, [selectedFlat]: e.target.value})}
                placeholder="₹"
                required
                style={{ padding: '0.5rem', width: '100%' }}
              />
            </div>
          )}

          {isVariable && targetType === 'ALL' && (
            <div style={{ marginTop: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
              <div style={{ padding: '0.5rem', background: 'var(--card-bg)', fontWeight: 'bold' }}>
                Variable Charge Data Entry Grid
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
                {residents.map(r => (
                  <div key={r.id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-color)', padding: '0.5rem', border: '1px solid var(--border-color)' }}>
                    <label style={{ fontSize: '0.85em', fontWeight: 'bold' }}>{r.block}-{r.flat_no}</label>
                    <input 
                      type="number" 
                      placeholder="₹ Amount" 
                      value={variableAmounts[r.id] || ''} 
                      onChange={(e) => setVariableAmounts({...variableAmounts, [r.id]: e.target.value})}
                      style={{ padding: '0.2rem', marginTop: '0.2rem' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className="primary-btn" style={{ padding: '0.75rem', marginTop: '1rem' }}>Generate Dues</button>
        </form>
      </div>
    </div>
  );
}

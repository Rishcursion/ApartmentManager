import React, { useState, useEffect } from 'react';
import { getDb, getResidentLedger } from './db';
import toast from 'react-hot-toast';

export default function TopupsHistory() {
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualResId, setManualResId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [allResidents, setAllResidents] = useState([]);

  const [manualSource, setManualSource] = useState('Cash');
  const [manualRef, setManualRef] = useState('');

  useEffect(() => {
    loadData();
    loadResidents();
  }, []);

  const loadResidents = async () => {
    try {
      const db = await getDb();
      const res = await db.select("SELECT id, block, flat_no, name FROM residents WHERE archived = 0 ORDER BY block, CAST(flat_no AS INTEGER)");
      setAllResidents(res);
      if (res.length > 0) setManualResId(res[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const allEvents = await getResidentLedger();
      const topupsEvents = allEvents.filter(e => e.type === 'topup').map(e => ({
        ...e.data,
        opening_balance: e.opening_balance,
        closing_balance: e.closing_balance
      })).reverse(); // Sort descending chronologically
      setTopups(topupsEvents);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleManualPayment = async (e) => {
    e.preventDefault();
    if (!manualResId || !manualAmount || isNaN(manualAmount) || Number(manualAmount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    
    try {
      const db = await getDb();
      await db.execute("UPDATE residents SET credit_balance = credit_balance + ? WHERE id = ?", [Number(manualAmount), manualResId]);
      const today = new Date().toISOString().split('T')[0];
      await db.execute("INSERT INTO topups (resident_id, amount, source, transaction_id, transaction_date) VALUES (?, ?, ?, ?, ?)", [manualResId, Number(manualAmount), manualSource, manualRef, today]);
      toast.success("Payment manually added to flat's credit balance!");
      setManualAmount('');
      setManualRef('');
      setShowManualModal(false);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error("Error saving manual payment.");
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h2>Top-up & Transaction History</h2>
        <button className="primary-btn" onClick={() => setShowManualModal(true)}>+ Manual Payment</button>
      </div>

      {showManualModal && (
        <div className="modal-overlay">
          <div className="modal card" style={{maxWidth: '400px'}}>
            <h3>Record Manual Payment</h3>
            <p style={{fontSize: '0.9rem', color: 'var(--text-color)'}}>This will top up the flat's Advance Credit Wallet.</p>
            <form onSubmit={handleManualPayment} style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
              <div>
                <label>Select Apartment / Resident</label>
                <select value={manualResId} onChange={e => setManualResId(e.target.value)} style={{width: '100%', padding: '0.5rem', marginTop: '0.5rem'}}>
                  {allResidents.map(r => (
                    <option key={r.id} value={r.id}>{r.block}-{r.flat_no} ({r.name})</option>
                  ))}
                </select>
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <div style={{flex: 1}}>
                  <label>Amount (₹)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={manualAmount} 
                    onChange={e => setManualAmount(e.target.value)} 
                    placeholder="e.g. 1500"
                    style={{width: '100%', padding: '0.5rem', marginTop: '0.5rem'}}
                  />
                </div>
                <div style={{flex: 1}}>
                  <label>Method of Payment</label>
                  <select value={manualSource} onChange={e => setManualSource(e.target.value)} style={{width: '100%', padding: '0.5rem', marginTop: '0.5rem'}}>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI / GPay</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label>Transaction ID / Notes (Optional)</label>
                <input 
                  type="text" 
                  value={manualRef} 
                  onChange={e => setManualRef(e.target.value)} 
                  placeholder="e.g. Chq No, UPI Ref..."
                  style={{width: '100%', padding: '0.5rem', marginTop: '0.5rem'}}
                />
              </div>
              <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                <button type="submit" className="primary-btn" style={{flex: 1}}>Add Funds</button>
                <button type="button" onClick={() => setShowManualModal(false)} style={{flex: 1}}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container" style={{marginTop: '2rem'}}>
        {loading ? (
          <div style={{padding: '2rem', textAlign: 'center'}}>Loading history...</div>
        ) : (
          <table>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
              <tr>
                <th>Tx ID</th>
                <th>Apprvl Date / Time</th>
                <th>Bank Date</th>
                <th>Block/Flat</th>
                <th>Resident</th>
                <th>Opening Bal.</th>
                <th>Amount Paid (Cr)</th>
                <th>Method of Payment</th>
                <th>Closing Bal.</th>
                <th>Transaction Ref / Notes</th>
              </tr>
            </thead>
            <tbody>
              {topups.map(t => {
                const rawDate = t.created_at ? t.created_at.replace(' ', 'T') + 'Z' : '';
                const displayDate = rawDate ? new Date(rawDate).toLocaleString() : '-';
                return (
                <tr key={t.id}>
                  <td>#{t.id}</td>
                  <td><small>{displayDate}</small></td>
                  <td>{t.transaction_date || '-'}</td>
                  <td>{t.block}-{t.flat_no}</td>
                  <td>{t.name}</td>
                  <td>{t.opening_balance === 0 ? "0.00" : (t.opening_balance > 0 ? `₹${t.opening_balance} Dr` : `₹${Math.abs(t.opening_balance)} Cr`)}</td>
                  <td style={{color: 'var(--primary-color)', fontWeight: 'bold'}}>+ ₹{t.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td><span className="badge" style={{background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)'}}>{t.source}</span></td>
                  <td style={{fontWeight: 'bold', color: t.closing_balance > 0 ? 'var(--error-color, #e74c3c)' : (t.closing_balance < 0 ? '#27ae60' : 'inherit')}}>
                    {t.closing_balance === 0 ? "0.00" : (t.closing_balance > 0 ? `₹${t.closing_balance} Dr` : `₹${Math.abs(t.closing_balance)} Cr`)}
                  </td>
                  <td><small>{t.transaction_id || '-'}</small></td>
                </tr>
                );
              })}
              {topups.length === 0 && (
                <tr><td colSpan="10" style={{textAlign: 'center', padding: '2rem'}}>No transactions found yet. Import a CSV or add a manual payment!</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

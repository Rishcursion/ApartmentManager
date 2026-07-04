import React, { useState, useEffect } from 'react';
import { getDb, getResidentLedger, getPeriodDates, recordTopup } from './db';
import toast from 'react-hot-toast';

export default function TopupsHistory() {
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlock, setSelectedBlock] = useState('All');
  const [selectedFlat, setSelectedFlat] = useState('All');
  const [selectedFY, setSelectedFY] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [allResidents, setAllResidents] = useState([]);

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualResId, setManualResId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);

  const [manualSource, setManualSource] = useState('Cash');
  const [manualRef, setManualRef] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const { startDate, endDate } = getPeriodDates(selectedFY, selectedMonth);

  const filteredTopups = topups.filter(t => 
    (selectedBlock === 'All' || t.block === selectedBlock) &&
    (selectedFlat === 'All' || String(t.flat_no) === String(selectedFlat)) &&
    (t.date >= startDate && t.date <= endDate)
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const fys = await db.select("SELECT DISTINCT fiscal_year FROM dues WHERE fiscal_year IS NOT NULL ORDER BY fiscal_year DESC");
      setFiscalYears(fys.map(f => f.fiscal_year));

      const blks = await db.select("SELECT DISTINCT block FROM residents WHERE archived = 0 ORDER BY block");
      setBlocks(blks.map(b => b.block));
      
      const resData = await db.select("SELECT id, block, flat_no, name FROM residents WHERE archived = 0 ORDER BY block, CAST(flat_no AS INTEGER)");
      setAllResidents(resData);
      if (!manualResId && resData.length > 0) setManualResId(String(resData[0].id));

      const allEvents = await getResidentLedger();
      const topupsEvents = allEvents.filter(e => e.type === 'topup').map(e => ({
        ...e.data,
        opening_balance: e.opening_balance,
        closing_balance: e.closing_balance,
        date: e.date
      })).reverse();
      setTopups(topupsEvents);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleManualPayment = async (e) => {
    e.preventDefault();
    if (isProcessing) return;
    if (!manualResId || !manualAmount || isNaN(manualAmount) || Number(manualAmount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    
    setIsProcessing(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await recordTopup({
        residentId: manualResId,
        amount: Number(manualAmount),
        source: manualSource,
        transactionId: manualRef,
        transactionDate: manualDate || today
      });
      if (result.inserted) {
        toast.success("Payment manually added to flat's credit balance!");
        setManualAmount('');
        setManualRef('');
        setShowManualModal(false);
        loadData();
      } else {
        toast.error("This manual payment already exists.");
      }
    } catch (e) {
      console.error(e);
      toast.error(`Error saving manual payment: ${e.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header flex-between mb-1">
        <h2>Top-up & Transaction History</h2>
        <div className="flex-row gap-1 flex-wrap">
          <select value={selectedBlock} onChange={e => { setSelectedBlock(e.target.value); setSelectedFlat('All'); }}>
            <option value="All">All Blocks</option>
            {blocks.map(b => <option key={b} value={b}>Block {b}</option>)}
          </select>
          <select value={selectedFlat} onChange={e => setSelectedFlat(e.target.value)}>
            <option value="All">All Flats</option>
            {Array.from(new Set(allResidents.filter(r => selectedBlock === 'All' || r.block === selectedBlock).map(r => r.flat_no))).map(f => (
              <option key={f} value={f}>Flat {f}</option>
            ))}
          </select>
          <select value={selectedFY} onChange={e => setSelectedFY(e.target.value)}>
            <option value="All">All Fiscal Years</option>
            {fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            <option value="All">All Months</option>
            {["April","May","June","July","August","September","October","November","December","January","February","March"].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button className="primary-btn" onClick={() => setShowManualModal(true)}>+ Manual Payment</button>
        </div>
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
              <div style={{display: 'flex', gap: '1rem'}}>
                <div style={{flex: 1}}>
                  <label>Date Paid</label>
                  <input 
                    type="date" 
                    value={manualDate} 
                    onChange={e => setManualDate(e.target.value)} 
                    style={{width: '100%', padding: '0.5rem', marginTop: '0.5rem'}}
                  />
                </div>
                <div style={{flex: 1}}>
                  <label>Transaction ID / Notes</label>
                  <input 
                    type="text" 
                    value={manualRef} 
                    onChange={e => setManualRef(e.target.value)} 
                    placeholder="e.g. Chq No, UPI Ref..."
                    style={{width: '100%', padding: '0.5rem', marginTop: '0.5rem'}}
                  />
                </div>
              </div>
              <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                <button type="submit" className="primary-btn" disabled={isProcessing} style={{flex: 1}}>
                  {isProcessing ? 'Processing...' : 'Add Funds'}
                </button>
                <button type="button" disabled={isProcessing} onClick={() => setShowManualModal(false)} style={{flex: 1}}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-scroll mt-2">
        {loading ? (
          <div className="p-2 text-center">Loading history...</div>
        ) : (
          <table>
            <thead className="sticky-header" style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
              <tr>
                <th>Tx ID</th>
                <th>Apprvl Date / Time</th>
                <th>Bank Date</th>
                <th>Block/Flat</th>
                <th>Resident</th>
                <th className="money">Opening Bal.</th>
                <th className="money">Amount Paid (Cr)</th>
                <th>Method of Payment</th>
                <th className="money">Closing Bal.</th>
                <th>Transaction Ref / Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredTopups.map(t => {
                const rawDate = t.created_at ? t.created_at.replace(' ', 'T') + 'Z' : '';
                const displayDate = rawDate ? new Date(rawDate).toLocaleString() : '-';
                return (
                <tr key={t.id}>
                  <td>#{t.id}</td>
                  <td><small>{displayDate}</small></td>
                  <td>{t.transaction_date || '-'}</td>
                  <td>{t.block}-{t.flat_no}</td>
                  <td>{t.name}</td>
                  <td className="money">{t.opening_balance === 0 ? "0.00" : (t.opening_balance > 0 ? `₹${t.opening_balance} Dr` : `₹${Math.abs(t.opening_balance)} Cr`)}</td>
                  <td className="money" style={{color: 'var(--primary-color)', fontWeight: 'bold'}}>+ ₹{t.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td><span className="badge" style={{background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)'}}>{t.source}</span></td>
                  <td className="money fw-bold" style={{color: t.closing_balance > 0 ? 'var(--error-color, #e74c3c)' : (t.closing_balance < 0 ? '#27ae60' : 'inherit')}}>
                    {t.closing_balance === 0 ? "0.00" : (t.closing_balance > 0 ? `₹${t.closing_balance} Dr` : `₹${Math.abs(t.closing_balance)} Cr`)}
                  </td>
                  <td><small>{t.transaction_id || '-'}</small></td>
                </tr>
                );
              })}
              {filteredTopups.length === 0 && (
                <tr><td colSpan="10" style={{textAlign: 'center', padding: '2rem'}}>
                  {topups.length === 0 ? 'No transactions found yet. Import a CSV or add a manual payment!' : 'No transactions match the selected filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

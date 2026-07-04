import React, { useState, useEffect } from 'react';
import { getDb, getResidentLedger, getPeriodDates, settleDue } from './db';
import toast from 'react-hot-toast';

export default function Ledger() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState('outstanding'); // outstanding, settled, all
  const [selectedBlock, setSelectedBlock] = useState('All');
  const [selectedFlat, setSelectedFlat] = useState('All');
  const [selectedFY, setSelectedFY] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [allResidents, setAllResidents] = useState([]);
  const [dues, setDues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'block', direction: 'asc' });
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);



  useEffect(() => {
    loadData();
  }, [viewMode, selectedCategory, selectedBlock, selectedFlat, selectedFY, selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const cats = await db.select("SELECT * FROM fee_categories");
      setCategories(cats);

      const fys = await db.select("SELECT DISTINCT fiscal_year FROM dues WHERE fiscal_year IS NOT NULL ORDER BY fiscal_year DESC");
      setFiscalYears(fys.map(f => f.fiscal_year));

      const blks = await db.select("SELECT DISTINCT block FROM residents WHERE archived = 0 ORDER BY block");
      setBlocks(blks.map(b => b.block));
      
      const resData = await db.select("SELECT id, block, flat_no FROM residents WHERE archived = 0 ORDER BY block, CAST(flat_no AS INTEGER)");
      setAllResidents(resData);

      const allEvents = await getResidentLedger();
      let realDues = allEvents.filter(e => e.type === 'due').map(e => ({
        unique_id: e.data.id,
        res_id: e.data.resident_id,
        block: e.data.block,
        flat_num: parseInt(e.data.flat_no),
        flat: e.data.flat_no,
        name: e.data.name,
        credit_balance: e.data.credit_balance,
        head: e.data.head,
        total_due: e.data.amount,
        total_paid: e.data.paid_amount,
        cumulative_due: e.data.amount - e.data.paid_amount,
        months_list: e.data.month + ' ' + e.data.fiscal_year,
        status: e.data.status,
        opening_balance: e.opening_balance,
        closing_balance: e.closing_balance,
        date: e.date
      }));

      if (viewMode === 'outstanding') {
        realDues = realDues.filter(d => d.status !== 'Paid' || d.cumulative_due > 0);
      } else if (viewMode === 'settled') {
        realDues = realDues.filter(d => d.status === 'Paid' || d.cumulative_due <= 0);
      }

      if (selectedCategory !== 'All') {
        realDues = realDues.filter(d => d.head === selectedCategory);
      }
      
      setDues(realDues.reverse()); // default sort descending chronologically
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedDues = [...dues].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
    if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const { startDate, endDate } = getPeriodDates(selectedFY, selectedMonth);

  const filteredRows = sortedDues.filter(due => 
    (selectedBlock === 'All' || due.block === selectedBlock) &&
    (selectedFlat === 'All' || due.flat === selectedFlat) &&
    (due.date >= startDate && due.date <= endDate)
  );

  const handleSettle = async (due) => {
    const owed = due.cumulative_due;
    const avail = due.credit_balance || 0;
    
    if (avail <= 0) {
      toast.error("This resident has no advance credit balance to settle this bill. Import a CSV payment first!");
      return;
    }
    
    const amtToSettle = Math.min(owed, avail);
    setPendingSettlement({ due, amount: amtToSettle, owed, available: avail });
  };

  const confirmSettlement = async () => {
    if (!pendingSettlement || isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await settleDue({
        dueId: pendingSettlement.due.unique_id,
        residentId: pendingSettlement.due.res_id,
        amount: pendingSettlement.amount
      });
      setPendingSettlement(null);
      loadData();
      toast.success(`Settled ₹${result.amountSettled} for this bill`);
    } catch (e) {
      console.error("Settlement error:", e);
      toast.error(`Error settling due: ${e.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };



  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2 className="section-title">Dues & Payments Ledger</h2>
          <p className="section-subtitle">Settle billed dues using each apartment's available wallet credit.</p>
        </div>
      </div>

      <div className="filters flex-row gap-1 mb-1 flex-wrap">
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
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
            <option value="outstanding">Outstanding Dues Only</option>
            <option value="settled">Settled / Paid Bills</option>
            <option value="all">All Dues (Ledger)</option>
          </select>
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="All">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      
      <div className="table-container">
        {loading ? (
          <div className="skeleton-rows">
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
          </div>
        ) : (
          <table>
            <thead className="sticky-header" style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
              <tr>
                <th onClick={() => requestSort('block')} style={{cursor:'pointer'}}>Block/Flat {sortConfig.key === 'block' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('name')} style={{cursor:'pointer'}}>Resident Name {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('opening_balance')} style={{cursor:'pointer'}}>Opening Bal. {sortConfig.key === 'opening_balance' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('head')} style={{cursor:'pointer'}}>Charge/Head {sortConfig.key === 'head' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('months_list')} style={{cursor:'pointer'}}>Period {sortConfig.key === 'months_list' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('total_due')} style={{cursor:'pointer'}}>Amount Due {sortConfig.key === 'total_due' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('total_paid')} style={{cursor:'pointer'}}>Amount Paid {sortConfig.key === 'total_paid' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('closing_balance')} style={{cursor:'pointer'}}>Closing Bal. {sortConfig.key === 'closing_balance' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('status')} style={{cursor:'pointer'}}>Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(due => {
                const isSettled = due.cumulative_due <= 0;
                return (
                  <tr key={due.unique_id}>
                    <td>{due.block}-{due.flat}</td>
                    <td>{due.name}</td>
                    <td className="money">{due.opening_balance === 0 ? "0.00" : (due.opening_balance > 0 ? `₹${due.opening_balance} Dr` : `₹${Math.abs(due.opening_balance)} Cr`)}</td>
                    <td>{due.head}</td>
                    <td>{due.months_list}</td>
                    <td className="money">₹{due.total_due}</td>
                    <td className="money" style={{color: 'var(--primary-color)'}}>₹{due.total_paid || 0}</td>
                    <td className="money" style={{fontWeight: 'bold', color: due.closing_balance > 0 ? 'var(--error-color, #e74c3c)' : (due.closing_balance < 0 ? '#27ae60' : 'inherit')}}>
                      {due.closing_balance === 0 ? "0.00" : (due.closing_balance > 0 ? `₹${due.closing_balance} Dr` : `₹${Math.abs(due.closing_balance)} Cr`)}
                    </td>
                    <td><span className={`badge ${due.status.toLowerCase()}`}>{due.status}</span></td>
                    <td>
                      {!isSettled && (due.credit_balance > 0) && (
                        <button 
                          className="action-btn" 
                          onClick={() => handleSettle(due)}
                          style={{padding: '4px 8px', fontSize: '12px'}}
                        >
                          Settle
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr><td colSpan="10" style={{textAlign:'center'}}>No dues found for this view! 🎉</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {pendingSettlement && (
        <div className="modal-overlay">
          <div className="modal card">
            <h3>Settle Due</h3>
            <p className="section-subtitle">
              {pendingSettlement.due.block}-{pendingSettlement.due.flat} · {pendingSettlement.due.head} · {pendingSettlement.due.months_list}
            </p>
            <div className="summary-grid mt-1">
              <div className="summary-tile">
                <div className="summary-label">Outstanding</div>
                <div className="summary-value">₹{pendingSettlement.owed.toLocaleString()}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Wallet Credit</div>
                <div className="summary-value">₹{pendingSettlement.available.toLocaleString()}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Settle Now</div>
                <div className="summary-value">₹{pendingSettlement.amount.toLocaleString()}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" disabled={isProcessing} onClick={() => setPendingSettlement(null)}>Cancel</button>
              <button className="primary-btn" disabled={isProcessing} onClick={confirmSettlement}>
                {isProcessing ? 'Processing...' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

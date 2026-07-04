import React, { useState, useEffect } from 'react';
import { getDb } from './db';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState('outstanding'); // outstanding, settled, all
  const [searchTerm, setSearchTerm] = useState('');
  const [dues, setDues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'block', direction: 'asc' });



  useEffect(() => {
    loadData();
  }, [viewMode, selectedCategory]);

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const cats = await db.select("SELECT * FROM fee_categories");
      setCategories(cats);

      let query = `
        SELECT 
          d.id as unique_id,
          r.id as res_id, r.block, CAST(r.flat_no AS INTEGER) as flat_num, r.flat_no as flat, r.name, r.credit_balance,
          c.name as head, 
          d.amount as total_due,
          d.paid_amount as total_paid,
          (d.amount - d.paid_amount) as cumulative_due,
          d.month || ' ' || d.fiscal_year as months_list,
          d.status
        FROM dues d
        JOIN residents r ON d.resident_id = r.id
        JOIN fee_categories c ON d.fee_category_id = c.id
        WHERE r.archived = 0
      `;

      if (viewMode === 'outstanding') {
        query += " AND (d.status != 'Paid' OR d.amount - d.paid_amount > 0)";
      } else if (viewMode === 'settled') {
        query += " AND (d.status = 'Paid' OR d.amount - d.paid_amount <= 0)";
      }

      let params = [];

      if (selectedCategory !== 'All') {
        query += " AND c.name = ?";
        params.push(selectedCategory);
      }
      
      query += " ORDER BY r.block, CAST(r.flat_no AS INTEGER), d.id DESC";
      
      const realDues = await db.select(query, params);
      setDues(realDues);
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

  const filteredRows = sortedDues.filter(due => 
    `${due.block}-${due.flat}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (due.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSettle = async (due) => {
    const owed = due.cumulative_due;
    const avail = due.credit_balance || 0;
    
    if (avail <= 0) {
      toast.error("This resident has no advance credit balance to settle this bill. Import a CSV payment first!");
      return;
    }
    
    const amtToSettle = Math.min(owed, avail);
    const confirmMsg = `Settle ₹${amtToSettle} of this ₹${owed} bill using the flat's available credit of ₹${avail}?`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      const db = await getDb();
      const newPaid = due.total_paid + amtToSettle;
      const newStatus = newPaid >= due.total_due ? 'Paid' : 'Partial';
      
      await db.execute("UPDATE dues SET paid_amount = ?, status = ? WHERE id = ?", [newPaid, newStatus, due.unique_id]);
      await db.execute("UPDATE residents SET credit_balance = credit_balance - ? WHERE id = ?", [amtToSettle, due.res_id]);
      
      loadData();
      toast.success(`Settled ₹${amtToSettle} for this bill`);
    } catch (e) {
      console.error(e);
      toast.error("Error settling due.");
    }
  };



  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dues & Payments Ledger</h2>
      </div>

      <div className="filters" style={{display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem'}}>
          <input 
            type="text" 
            placeholder="Search Flat (e.g. A-4) or Name..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '0.5rem', width: '250px' }}
          />
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
            <thead>
              <tr>
                <th onClick={() => requestSort('block')} style={{cursor:'pointer'}}>Block/Flat {sortConfig.key === 'block' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('name')} style={{cursor:'pointer'}}>Resident Name {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('credit_balance')} style={{cursor:'pointer'}}>Avail. Credit {sortConfig.key === 'credit_balance' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('head')} style={{cursor:'pointer'}}>Charge/Head {sortConfig.key === 'head' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('months_list')} style={{cursor:'pointer'}}>Period {sortConfig.key === 'months_list' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('total_due')} style={{cursor:'pointer'}}>Amount Due {sortConfig.key === 'total_due' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('total_paid')} style={{cursor:'pointer'}}>Amount Paid {sortConfig.key === 'total_paid' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => requestSort('cumulative_due')} style={{cursor:'pointer'}}>Balance {sortConfig.key === 'cumulative_due' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
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
                    <td style={{color: 'var(--primary-color)', fontWeight: 'bold'}}>₹{due.credit_balance || 0}</td>
                    <td>{due.head}</td>
                    <td>{due.months_list}</td>
                    <td>₹{due.total_due}</td>
                    <td style={{color: 'var(--primary-color)'}}>₹{due.total_paid || 0}</td>
                    <td style={{fontWeight: 'bold', color: isSettled ? '#7f8c8d' : 'var(--error-color, #e74c3c)'}}>
                      ₹{due.cumulative_due}
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
    </div>
  );
}

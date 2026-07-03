import React, { useState, useEffect } from 'react';
import { getDb } from './db';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalDue: 0, totalPaid: 0, outstanding: 0, totalCredit: 0 });
  const [categories, setCategories] = useState([]);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [blocks, setBlocks] = useState([]);
  
  const [reportType, setReportType] = useState('collection'); // 'collection' or 'due'
  const [selectedFY, setSelectedFY] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBlock, setSelectedBlock] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [flatData, setFlatData] = useState([]);
  const [dueData, setDueData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedFY, selectedCategory, selectedBlock, reportType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      
      // Load top stats
      const duesRes = await db.select(`
        SELECT SUM(d.amount) as total_due, SUM(d.paid_amount) as total_paid
        FROM dues d
        JOIN residents r ON d.resident_id = r.id
        WHERE r.archived = 0
      `);
      const creditRes = await db.select(`SELECT SUM(credit_balance) as total_credit FROM residents WHERE archived = 0`);
      
      const tDue = duesRes[0]?.total_due || 0;
      const tPaid = duesRes[0]?.total_paid || 0;
      setStats({
        totalDue: tDue, totalPaid: tPaid,
        outstanding: tDue - tPaid,
        totalCredit: creditRes[0]?.total_credit || 0
      });

      // Load filters
      const cats = await db.select("SELECT * FROM fee_categories");
      setCategories(cats);
      
      const fys = await db.select("SELECT DISTINCT fiscal_year FROM dues WHERE fiscal_year IS NOT NULL ORDER BY fiscal_year DESC");
      setFiscalYears(fys.map(f => f.fiscal_year));

      const blks = await db.select("SELECT DISTINCT block FROM residents WHERE archived = 0 ORDER BY block");
      setBlocks(blks.map(b => b.block));

      // Build safe injected queries to avoid subquery parameter binding issues in Tauri SQLite
      let fyFilter = selectedFY !== 'All' ? ` AND d.fiscal_year = '${selectedFY}'` : '';
      let catFilter = selectedCategory !== 'All' ? ` AND c.name = '${selectedCategory.replace(/'/g, "''")}'` : '';
      let blockFilter = selectedBlock !== 'All' ? ` AND r.block = '${selectedBlock.replace(/'/g, "''")}'` : '';

      if (reportType === 'collection') {
        let duesQuery = `
          SELECT d.resident_id, SUM(d.amount) as total_due, SUM(d.paid_amount) as total_paid
          FROM dues d
          JOIN fee_categories c ON d.fee_category_id = c.id
          WHERE 1=1 ${fyFilter} ${catFilter}
          GROUP BY d.resident_id
        `;

        const finalQuery = `
          SELECT 
            r.block, CAST(r.flat_no AS INTEGER) as flat_num, r.flat_no as flat, r.name,
            COALESCE(sq.total_due, 0) as total_due,
            COALESCE(sq.total_paid, 0) as total_paid
          FROM residents r
          LEFT JOIN (${duesQuery}) sq ON r.id = sq.resident_id
          WHERE r.archived = 0 ${blockFilter}
          ORDER BY r.block, CAST(r.flat_no AS INTEGER)
        `;
        const rows = await db.select(finalQuery);
        setFlatData(rows);
      } else {
        // Due Report (Itemized Outstanding)
        const dueReportQuery = `
          SELECT 
            r.block, r.flat_no as flat, r.name,
            c.name as head, d.month || ' ' || d.fiscal_year as period,
            d.amount as total_due, d.paid_amount as total_paid,
            (d.amount - d.paid_amount) as balance
          FROM dues d
          JOIN residents r ON d.resident_id = r.id
          JOIN fee_categories c ON d.fee_category_id = c.id
          WHERE r.archived = 0 AND d.amount > d.paid_amount
          ${fyFilter} ${catFilter} ${blockFilter}
          ORDER BY r.block, CAST(r.flat_no AS INTEGER), d.id DESC
        `;
        const rows = await db.select(dueReportQuery);
        setDueData(rows);
      }

    } catch (e) {
      console.error("Dashboard error:", e);
    }
    setLoading(false);
  };

  const exportToCSV = () => {
    let csv = "";
    
    if (reportType === 'collection') {
      csv += "Block ID,Flat No,Resident Name,Total Amount Due,Total Amount Paid,Total Amount Outstanding\n";
      let sumDue = 0, sumPaid = 0, sumOut = 0;
      
      filteredFlats.forEach(row => {
        const out = row.total_due - row.total_paid;
        csv += `${row.block},${row.flat},"${row.name || ''}",${row.total_due},${row.total_paid},${out}\n`;
        sumDue += row.total_due;
        sumPaid += row.total_paid;
        sumOut += out;
      });
      csv += `Total Result,,,"${sumDue}","${sumPaid}","${sumOut}"\n`;
    } else {
      csv += "Block ID,Flat No,Resident Name,Charge Head,Period,Amount Due,Amount Paid,Balance\n";
      let sumDue = 0, sumPaid = 0, sumBal = 0;
      
      filteredDues.forEach(row => {
        csv += `${row.block},${row.flat},"${row.name || ''}","${row.head}","${row.period}",${row.total_due},${row.total_paid},${row.balance}\n`;
        sumDue += row.total_due;
        sumPaid += row.total_paid;
        sumBal += row.balance;
      });
      csv += `Total Result,,,,"${sumDue}","${sumPaid}","${sumBal}"\n`;
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Society_${reportType === 'collection' ? 'Collection' : 'Due'}_Report_${selectedBlock !== 'All' ? 'Block_' + selectedBlock : 'All_Blocks'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredFlats = flatData.filter(r => 
    `${r.block}-${r.flat}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDues = dueData.filter(r => 
    `${r.block}-${r.flat}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  let grandTotalDue = 0;
  let grandTotalPaid = 0;
  let grandTotalOut = 0;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Society Financial Dashboard</h2>
      </div>
      
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginTop: '1rem' }}>
        <div className="card stat-card" style={{borderLeft: '4px solid var(--primary-color)'}}>
          <h3>Total Generated Dues</h3>
          <div className="stat-value" style={{fontSize: '2.5rem', fontWeight: 'bold'}}>₹{stats.totalDue.toLocaleString()}</div>
          <p>Total value of all bills ever generated</p>
        </div>
        <div className="card stat-card" style={{borderLeft: '4px solid #2ecc71'}}>
          <h3>Total Collected</h3>
          <div className="stat-value" style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#27ae60'}}>₹{stats.totalPaid.toLocaleString()}</div>
          <p>Money successfully settled against bills</p>
        </div>
        <div className="card stat-card" style={{borderLeft: '4px solid #e74c3c'}}>
          <h3>Outstanding Receivables</h3>
          <div className="stat-value" style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#c0392b'}}>₹{stats.outstanding.toLocaleString()}</div>
          <p>Total amount currently owed by residents</p>
        </div>
        <div className="card stat-card" style={{borderLeft: '4px solid #f39c12'}}>
          <h3>Unallocated Advance Credit</h3>
          <div className="stat-value" style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#f39c12'}}>₹{stats.totalCredit.toLocaleString()}</div>
          <p>Resident top-ups waiting to be settled</p>
        </div>
      </div>

      <div className="card" style={{marginTop: '2rem', padding: '0'}}>
        <div style={{padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between'}}>
          <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
            <select value={reportType} onChange={e => setReportType(e.target.value)} style={{fontWeight: 'bold', fontSize: '1.1rem', border: 'none', background: 'transparent', outline: 'none'}}>
              <option value="collection">Collection Report (Flat-wise)</option>
              <option value="due">Itemized Due Report (Outstanding)</option>
            </select>
            
            <select value={selectedBlock} onChange={e => setSelectedBlock(e.target.value)}>
              <option value="All">All Blocks</option>
              {blocks.map(b => <option key={b} value={b}>Block {b}</option>)}
            </select>
            <select value={selectedFY} onChange={e => setSelectedFY(e.target.value)}>
              <option value="All">All Fiscal Years</option>
              {fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
              <option value="All">All Collection Heads</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <input 
              type="text" 
              placeholder="Search Flat..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '0.4rem', width: '200px' }}
            />
          </div>
          <button className="primary-btn" onClick={exportToCSV} style={{padding: '0.4rem 1rem'}}>Export to Excel/CSV</button>
        </div>
        
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {loading ? (
             <div style={{padding: '2rem', textAlign: 'center'}}>Loading report...</div>
          ) : reportType === 'collection' ? (
            <table className="report-table">
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                <tr>
                  <th>Block ID</th>
                  <th>Flat No</th>
                  <th>Resident Name</th>
                  <th style={{textAlign:'right'}}>Total Amount Due</th>
                  <th style={{textAlign:'right'}}>Total Amount Paid</th>
                  <th style={{textAlign:'right'}}>Total Amount Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filteredFlats.map((row, i) => {
                  const out = row.total_due - row.total_paid;
                  grandTotalDue += row.total_due;
                  grandTotalPaid += row.total_paid;
                  grandTotalOut += out;
                  
                  const isNewBlock = i === 0 || filteredFlats[i-1].block !== row.block;

                  return (
                    <tr key={`${row.block}-${row.flat}`}>
                      <td style={{fontWeight: isNewBlock ? 'bold' : 'normal'}}>{isNewBlock ? `⊞ ${row.block}` : ''}</td>
                      <td>{row.flat}</td>
                      <td>{row.name}</td>
                      <td style={{textAlign:'right'}}>₹{row.total_due.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style={{textAlign:'right'}}>₹{row.total_paid.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style={{textAlign:'right'}}>₹{out.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  );
                })}
                <tr style={{fontWeight: 'bold', backgroundColor: 'var(--bg-color)'}}>
                  <td colSpan="3">Total Result</td>
                  <td style={{textAlign:'right'}}>₹{grandTotalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td style={{textAlign:'right'}}>₹{grandTotalPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td style={{textAlign:'right'}}>₹{grandTotalOut.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="report-table">
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                <tr>
                  <th>Block ID</th>
                  <th>Flat No</th>
                  <th>Resident Name</th>
                  <th>Charge Head</th>
                  <th>Period</th>
                  <th style={{textAlign:'right'}}>Amount Due</th>
                  <th style={{textAlign:'right'}}>Amount Paid</th>
                  <th style={{textAlign:'right'}}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredDues.map((row, i) => {
                  grandTotalDue += row.total_due;
                  grandTotalPaid += row.total_paid;
                  grandTotalOut += row.balance;
                  
                  return (
                    <tr key={i}>
                      <td>{row.block}</td>
                      <td>{row.flat}</td>
                      <td>{row.name}</td>
                      <td>{row.head}</td>
                      <td>{row.period}</td>
                      <td style={{textAlign:'right'}}>₹{row.total_due.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style={{textAlign:'right'}}>₹{row.total_paid.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style={{textAlign:'right', fontWeight: 'bold', color: 'var(--error-color, #e74c3c)'}}>₹{row.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  );
                })}
                <tr style={{fontWeight: 'bold', backgroundColor: 'var(--bg-color)'}}>
                  <td colSpan="5">Total Result</td>
                  <td style={{textAlign:'right'}}>₹{grandTotalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td style={{textAlign:'right'}}>₹{grandTotalPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td style={{textAlign:'right'}}>₹{grandTotalOut.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import Select from 'react-select';
import { getDb } from './db';
import toast from 'react-hot-toast';

export default function CSVImport() {
  const [rows, setRows] = useState(() => {
    const saved = sessionStorage.getItem('csvRows');
    return saved ? JSON.parse(saved) : [];
  });
  const [allFlats, setAllFlats] = useState([]);
  const [flatOptions, setFlatOptions] = useState([]);

  useEffect(() => {
    sessionStorage.setItem('csvRows', JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    console.log("Loading master data from DB...");
    const db = await getDb();
    const flats = await db.select("SELECT id as dbId, block, flat_no, name, payment_handles FROM residents WHERE archived = 0 ORDER BY block, CAST(flat_no AS INTEGER)");
    
    // Deduplicate on the frontend to protect against any DB anomalies
    const generatedMap = new Map();
    flats.forEach(f => {
      const id = `${f.block}${f.flat_no}`;
      if (!generatedMap.has(id)) {
        generatedMap.set(id, {
          ...f,
          id,
          handles: f.payment_handles ? f.payment_handles.split(',').filter(h => h.trim().length > 0) : []
        });
      }
    });
    
    const generated = Array.from(generatedMap.values());
    setAllFlats(generated);
    setFlatOptions(generated.map(f => f.id));
    console.log(`Loaded ${generated.length} unique flats from DB.`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) {
      console.log("No file selected.");
      return;
    }
    console.log(`Starting parse for file: ${file.name}`);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: (chunk) => {
        // Many bank statements have junk titles in the first few rows. 
        // We scan for the actual CSV header row.
        const lines = chunk.split(/\r?\n/);
        const headerIndex = lines.findIndex(l => l.includes('Tran Date') || l.includes('Cr Tran Amt') || l.includes('Account Number'));
        if (headerIndex > 0) {
          console.log(`Skipped ${headerIndex} junk header rows.`);
          return lines.slice(headerIndex).join('\n');
        }
        return chunk;
      },
      complete: (results) => {
        console.log(`PapaParse completed. Found ${results.data.length} raw rows.`);
        
        const parsedRows = results.data.map((r, index) => {
          // Check for exact column matches or partial fallback matches
          const narration = r['Tran Particular'] || r['Description'] || r['Narration'] || '';
          
          // The bank statement has 'Cr Tran Amt' but it might have quotes or spaces
          const crAmtStr = r['Cr Tran Amt'] || r['Credit'] || r['Amount'] || '0';
          // Clean commas and whitespace
          const crAmt = parseFloat(crAmtStr.replace(/,/g, '').trim()) || 0;
          
          if (crAmt <= 0) return null; // Only incoming payments

          const detectedFlats = [];
          allFlats.forEach(flat => {
            const regex = new RegExp(`\\b${flat.block}\\s*[-/]?\\s*${flat.flat_no}\\b`, 'i');
            const hasHandleMatch = flat.handles.some(h => narration.toLowerCase().includes(h.toLowerCase().trim()));
            if (regex.test(narration) || hasHandleMatch) {
              detectedFlats.push(flat.id);
            }
          });

          const uniqueDetectedFlats = [...new Set(detectedFlats)];

          return {
            id: index,
            date: r['Tran Date'] || r['Date'] || r['Value Date'] || 'Unknown Date',
            desc: narration,
            amount: crAmt,
            status: uniqueDetectedFlats.length === 0 ? 'unmapped' : uniqueDetectedFlats.length > 1 ? 'needs-allocation' : 'match',
            selectedFlats: uniqueDetectedFlats,
            splitAmounts: {}
          };
        }).filter(r => r !== null);

        console.log(`Filtered to ${parsedRows.length} valid credit transactions.`);
        setRows(parsedRows);
      },
      error: (err) => {
        console.error(`PapaParse Error: ${err.message}`);
      }
    });
  };

  const handleFlatSelection = (rowId, selectedOptions) => {
    const optionsArray = selectedOptions ? selectedOptions.map(s => s.value) : [];
    setRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { 
          ...r, 
          selectedFlats: optionsArray,
          status: optionsArray.length === 0 ? 'unmapped' : optionsArray.length > 1 ? 'needs-allocation' : 'match'
        };
      }
      return r;
    }));
  };

  const handleSplitAmount = (rowId, flatId, amountStr) => {
    const val = parseFloat(amountStr) || 0;
    setRows(prev => prev.map(r => {
      if (r.id === rowId) {
        const splits = { ...r.splitAmounts, [flatId]: val };
        return { ...r, splitAmounts: splits };
      }
      return r;
    }));
  };

  const [sortConfig, setSortConfig] = useState({ key: 'status', direction: 'asc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedRows = React.useMemo(() => {
    let sortable = [...rows];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [rows, sortConfig]);

  const approvePayment = async (row) => {
    // Real DB update to reflect in Dashboard
    const db = await getDb();
    try {
        // Find the resident IDs for the selected flats
        const selectedDbIds = row.selectedFlats.map(fId => {
          const flat = allFlats.find(f => f.id === fId);
          return flat ? flat.dbId : null;
        }).filter(id => id !== null);

        if (selectedDbIds.length === 0) return;

        for (const resId of selectedDbIds) {
          // Automatically learn the UPI handle if present in the description
          const upiMatch = row.desc.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z]*)/);
          if (upiMatch && upiMatch[0]) {
            const handle = upiMatch[0];
            const res = await db.select("SELECT payment_handles FROM residents WHERE id = ?", [resId]);
            if (res && res.length > 0) {
              let existingHandles = res[0].payment_handles || "";
              if (!existingHandles.toLowerCase().includes(handle.toLowerCase())) {
                const newHandles = existingHandles ? existingHandles + "," + handle : handle;
                await db.execute("UPDATE residents SET payment_handles = ? WHERE id = ?", [newHandles, resId]);
              }
            }
          }

          // Amount to apply for this flat (from split math or total)
          let amtToCredit = row.selectedFlats.length > 1 ? (row.splitAmounts[allFlats.find(f=>f.dbId === resId).id] || 0) : row.amount;
          
          if (amtToCredit > 0) {
            const res = await db.select("SELECT credit_balance FROM residents WHERE id = ?", [resId]);
            const currentCredit = res[0]?.credit_balance || 0;
            await db.execute("UPDATE residents SET credit_balance = ? WHERE id = ?", [currentCredit + amtToCredit, resId]);
            await db.execute("INSERT INTO topups (resident_id, amount, source, transaction_id, transaction_date) VALUES (?, ?, ?, ?, ?)", [resId, amtToCredit, 'CSV Import', row.desc ? row.desc.substring(0, 50) : '', row.date || '']);
          }
        }
        
        // Remove from UI
        setRows(prev => prev.filter(r => r.id !== row.id));
        toast.success("Payment approved and allocated");
    } catch (e) {
      console.error(e);
      toast.error("Database error applying payment.");
    }
  };

  return (
    <div className="csv-import">
      <div className="import-header">
        <h2>CSV Import and Allocation</h2>
        <div className="upload-btn-wrapper">
          <label className="primary-btn" style={{cursor: 'pointer'}}>
            Import New CSV
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div className="transactions-list full-width">
        {rows.length === 0 ? (
          <div className="empty-state">
            <p>Upload a CSV bank statement to begin.</p>
            <p><small>(Try uploading the statement from your Downloads folder!)</small></p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th onClick={() => requestSort('date')} style={{cursor:'pointer'}}>Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => requestSort('desc')} style={{cursor:'pointer'}}>Description {sortConfig.key === 'desc' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => requestSort('amount')} style={{cursor:'pointer'}}>Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => requestSort('status')} style={{cursor:'pointer'}}>Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th>Allocate to Flat(s)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const totalSplit = row.selectedFlats.reduce((sum, f) => sum + (row.splitAmounts[f] || 0), 0);
                const isSplitBalanced = row.selectedFlats.length > 1 ? Math.abs(totalSplit - row.amount) < 0.01 : true;

                return (
                  <tr key={row.id} className={`status-row ${row.status}`}>
                    <td>{row.date}</td>
                    <td className="desc-cell"><small>{row.desc}</small></td>
                    <td>₹{row.amount}</td>
                    <td><span className={`status-badge ${row.status}`}>{row.status.replace('-', ' ')}</span></td>
                    <td className="inline-allocation">
                      <Select
                        isMulti
                        options={allFlats.map(f => ({ value: f.id, label: `${f.id} (${f.name || 'Unassigned'})` }))}
                        value={row.selectedFlats.map(fId => {
                          const flat = allFlats.find(f => f.id === fId);
                          return { value: fId, label: flat ? `${flat.id} (${flat.name || 'Unassigned'})` : fId };
                        })}
                        onChange={(selected) => handleFlatSelection(row.id, selected)}
                        menuPortalTarget={document.body}
                        styles={{ 
                          menuPortal: base => ({ ...base, zIndex: 9999 }),
                          control: base => ({ ...base, minWidth: '150px' }) 
                        }}
                        placeholder="Search Flat..."
                      />

                      {/* Multi-flat split payment logic */}
                      {row.selectedFlats.length > 1 && (
                        <div className="split-inputs mt-2">
                          {row.selectedFlats.map(flatId => (
                            <div key={flatId} className="split-row">
                              <span>{flatId}:</span>
                              <input 
                                type="number" 
                                placeholder="₹ Amount" 
                                value={row.splitAmounts[flatId] || ''}
                                onChange={(e) => handleSplitAmount(row.id, flatId, e.target.value)}
                              />
                            </div>
                          ))}
                          <div className={`split-total ${!isSplitBalanced ? 'error-text' : 'success-text'}`}>
                            Allocated: ₹{totalSplit} / ₹{row.amount}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <button 
                        className="action-btn" 
                        disabled={row.selectedFlats.length === 0 || !isSplitBalanced}
                        onClick={() => approvePayment(row)}
                      >
                        Approve
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

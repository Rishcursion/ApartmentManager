import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import Select from 'react-select';
import { getDb, recordTopup } from './db';
import toast from 'react-hot-toast';

export default function CSVImport() {
  const [rows, setRows] = useState(() => {
    const saved = sessionStorage.getItem('csvRows');
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });
  const [allFlats, setAllFlats] = useState([]);
  const [masterDataLoaded, setMasterDataLoaded] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());

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
    setMasterDataLoaded(true);
    console.log(`Loaded ${generated.length} unique flats from DB.`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) {
      console.log("No file selected.");
      return;
    }
    if (!masterDataLoaded) {
      toast.error("Apartment data is still loading. Try again in a moment.");
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

  const importSummary = React.useMemo(() => {
    return rows.reduce((summary, row) => {
      summary.total += 1;
      summary.amount += row.amount;
      summary[row.status] += 1;
      return summary;
    }, { total: 0, amount: 0, match: 0, 'needs-allocation': 0, unmapped: 0 });
  }, [rows]);

  const canApproveRow = (row) => {
    if (row.selectedFlats.length === 0) return false;
    if (row.selectedFlats.length <= 1) return true;
    const totalSplit = row.selectedFlats.reduce((sum, f) => sum + (row.splitAmounts[f] || 0), 0);
    return Math.abs(totalSplit - row.amount) < 0.01;
  };

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

        let insertedCount = 0;
        let duplicateCount = 0;

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
            const result = await recordTopup({
              residentId: resId,
              amount: amtToCredit,
              source: 'CSV Import',
              transactionId: row.desc ? row.desc.substring(0, 50) : '',
              transactionDate: row.date || ''
            });
            if (result.inserted) insertedCount += 1;
            else duplicateCount += 1;
          }
        }
        
        // Remove from UI
        setRows(prev => prev.filter(r => r.id !== row.id));
        if (insertedCount > 0) {
          toast.success(`Payment approved.${duplicateCount ? ` Skipped ${duplicateCount} duplicate allocation(s).` : ''}`);
        } else {
          toast.error("No payment added. This transaction appears to be a duplicate.");
        }
    } catch (e) {
      console.error(e);
      toast.error("Database error applying payment.");
    }
  };

  const removeRow = (rowId) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  };

  const toggleRowSelection = (rowId) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedRowIds.size === sortedRows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(sortedRows.map(r => r.id)));
    }
  };

  const approveSelectedPayments = async () => {
    const selectedRowsData = sortedRows.filter(r => selectedRowIds.has(r.id));
    const readyRows = selectedRowsData.filter(canApproveRow);
    
    if (readyRows.length === 0) {
      toast.error("No valid selected payments to approve. Ensure you've mapped flats.");
      return;
    }

    for (const row of readyRows) {
      await approvePayment(row);
    }
    setSelectedRowIds(new Set());
  };

  const approveReadyPayments = async () => {
    const readyRows = sortedRows.filter(canApproveRow);
    if (readyRows.length === 0) {
      toast.error("No ready payments to approve.");
      return;
    }

    for (const row of readyRows) {
      await approvePayment(row);
    }
  };

  return (
    <div className="csv-import">
      <div className="import-header flex-between mb-1" style={{flexWrap: 'wrap', gap: '1rem'}}>
        <div>
          <h2 className="section-title">CSV Import and Allocation</h2>
          <p className="section-subtitle">Review incoming credits, map them to apartments, and approve wallet top-ups.</p>
        </div>
        <div className="toolbar flex-row gap-1 flex-wrap">
          {rows.length > 0 && (
            <>
              {selectedRowIds.size > 0 && (
                <button className="primary-btn" onClick={approveSelectedPayments}>Approve Selected ({selectedRowIds.size})</button>
              )}
              <button className="secondary-btn" onClick={approveReadyPayments}>Approve Ready</button>
              <button className="secondary-btn" onClick={() => { setRows([]); setSelectedRowIds(new Set()); }}>Clear Queue</button>
            </>
          )}
          <label className="primary-btn" style={{cursor: masterDataLoaded ? 'pointer' : 'not-allowed', opacity: masterDataLoaded ? 1 : 0.6}}>
            {masterDataLoaded ? 'Import New CSV' : 'Loading Apartments...'}
            <input type="file" accept=".csv" disabled={!masterDataLoaded} style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="summary-grid">
          <div className="summary-tile">
            <div className="summary-label">Transactions</div>
            <div className="summary-value">{importSummary.total}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Total Credit</div>
            <div className="summary-value">₹{importSummary.amount.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Auto Matched</div>
            <div className="summary-value">{importSummary.match}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Needs Split</div>
            <div className="summary-value">{importSummary['needs-allocation']}</div>
          </div>
          <div className="summary-tile">
            <div className="summary-label">Unmapped</div>
            <div className="summary-value">{importSummary.unmapped}</div>
          </div>
        </div>
      )}

      <div className="table-scroll w-full mt-2">
        {rows.length === 0 ? (
          <div className="empty-state">
            <p>Upload a CSV bank statement to begin.</p>
            <p><small>(Try uploading the statement from your Downloads folder!)</small></p>
          </div>
        ) : (
          <table>
            <thead className="sticky-header" style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
              <tr>
                <th>
                  <input 
                    type="checkbox" 
                    checked={rows.length > 0 && selectedRowIds.size === rows.length} 
                    onChange={toggleAllSelection} 
                  />
                </th>
                <th onClick={() => requestSort('date')} style={{cursor:'pointer'}}>Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => requestSort('desc')} style={{cursor:'pointer'}}>Description {sortConfig.key === 'desc' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th className="money" onClick={() => requestSort('amount')} style={{cursor:'pointer'}}>Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
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
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedRowIds.has(row.id)} 
                        onChange={() => toggleRowSelection(row.id)} 
                      />
                    </td>
                    <td>{row.date}</td>
                    <td className="desc-cell"><small>{row.desc}</small></td>
                    <td className="money">₹{row.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
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
                      <div className="flex-row gap-05">
                        <button 
                          className="action-btn primary-btn" 
                          disabled={!canApproveRow(row)}
                          onClick={() => approvePayment(row)}
                          style={{padding: '4px 8px'}}
                        >
                          Approve
                        </button>
                        <button 
                          className="action-btn"
                          onClick={() => removeRow(row.id)}
                          style={{padding: '4px 8px', backgroundColor: 'var(--error-color, #e74c3c)', color: 'white'}}
                        >
                          Skip
                        </button>
                      </div>
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

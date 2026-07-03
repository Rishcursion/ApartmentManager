import React, { useState, useEffect } from 'react';
import { getDb } from './db';

export default function Residents() {
  const [residents, setResidents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadResidents();
  }, []);

  const loadResidents = async () => {
    const db = await getDb();
    const result = await db.select("SELECT * FROM residents ORDER BY block, CAST(flat_no AS INTEGER)");
    setResidents(result);
  };

  const updateResident = async (id, field, value) => {
    const db = await getDb();
    await db.execute(`UPDATE residents SET ${field} = ? WHERE id = ?`, [value, id]);
    loadResidents();
  };

  const toggleArchive = async (id, isArchived) => {
    const db = await getDb();
    await db.execute("UPDATE residents SET archived = ? WHERE id = ?", [isArchived ? 0 : 1, id]);
    loadResidents();
  };

  const filteredResidents = residents.filter(r => 
    `${r.block}${r.flat_no}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.payment_handles || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="residents-management">
      <div className="dashboard-header">
        <h2>Apartment Management</h2>
        <input 
          type="text" 
          placeholder="Search Flat (e.g. A4) or Handle..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '0.5rem', width: '300px' }}
        />
      </div>

      <div className="card">
        <p>Assign Names and Payment Handles (like UPI IDs or Exact Bank Names) so the CSV Auto-importer can learn and map payments perfectly. You can soft-delete non-existent flats here.</p>
        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
              <tr>
                <th>Flat</th>
                <th>Resident Name</th>
                <th>Contact Number</th>
                <th>Payment Handles (UPI / Aliases)</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredResidents.map(res => (
                <tr key={res.id} style={{ opacity: res.archived ? 0.5 : 1 }}>
                  <td><strong>{res.block}-{res.flat_no}</strong></td>
                  <td>
                    <input 
                      type="text" 
                      defaultValue={res.name}
                      onBlur={(e) => updateResident(res.id, 'name', e.target.value)}
                      disabled={res.archived === 1}
                      style={{ width: '90%', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '4px' }}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      defaultValue={res.contact}
                      onBlur={(e) => updateResident(res.id, 'contact', e.target.value)}
                      disabled={res.archived === 1}
                      style={{ width: '90%', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '4px' }}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      placeholder="e.g. mehalam651@oki"
                      defaultValue={res.payment_handles}
                      onBlur={(e) => updateResident(res.id, 'payment_handles', e.target.value)}
                      disabled={res.archived === 1}
                      style={{ width: '90%', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '4px' }}
                    />
                  </td>
                  <td>
                    {res.archived === 1 ? 'Deleted' : 'Active'}
                  </td>
                  <td>
                    <button 
                      onClick={() => toggleArchive(res.id, res.archived)}
                      className="action-btn"
                      style={{ backgroundColor: res.archived ? 'var(--primary-color)' : 'var(--error-color, #e74c3c)', color: 'white', border: 'none' }}
                    >
                      {res.archived ? 'Restore' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

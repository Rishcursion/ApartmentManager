import Database from "@tauri-apps/plugin-sql";

let db = null;

export async function initDb() {
  if (db) return db;
  try {
    db = await Database.load("sqlite:apartment.db");
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block TEXT NOT NULL,
        flat_no TEXT NOT NULL,
        name TEXT NOT NULL,
        contact TEXT
      );
    `);
    
    try {
      await db.execute(`ALTER TABLE residents ADD COLUMN payment_handles TEXT`);
    } catch (e) {
      // Column already exists
    }

    try {
      await db.execute(`ALTER TABLE residents ADD COLUMN archived INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    try {
      await db.execute(`ALTER TABLE residents ADD COLUMN credit_balance REAL DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS fee_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        archived INTEGER DEFAULT 0
      );
    `);
    
    try {
      await db.execute(`ALTER TABLE fee_categories ADD COLUMN is_variable INTEGER DEFAULT 0`);
    } catch (e) {}
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS dues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER,
        fee_category_id INTEGER,
        month TEXT,
        fiscal_year TEXT,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'Unpaid',
        FOREIGN KEY(resident_id) REFERENCES residents(id),
        FOREIGN KEY(fee_category_id) REFERENCES fee_categories(id)
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        amount REAL,
        ref_no TEXT,
        raw_narration TEXT
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS topups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER,
        amount REAL NOT NULL,
        source TEXT,
        transaction_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
      );
    `);
    
    try {
      await db.execute(`ALTER TABLE topups ADD COLUMN transaction_date TEXT`);
    } catch (e) {}
    
    // Seed residents synchronously to prevent React Strict Mode race conditions
    const resCount = await db.select("SELECT COUNT(*) as count FROM residents");
    if (resCount[0].count === 0) {
      console.log("Seeding initial residents...");
      const blocks = ['A','B','C','D','E','F','G','H'];
      for (let b of blocks) {
        for (let i = 1; i <= 15; i++) {
          await db.execute("INSERT INTO residents (block, flat_no, name, contact, payment_handles) VALUES (?, ?, 'Unassigned', '', '')", [b, i.toString()]);
        }
      }
    }

    return db;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}

export async function getDb() {
  if (!db) return await initDb();
  return db;
}

export async function getResidentLedger(residentId = null) {
  const db = await getDb();
  
  let duesQuery = `
    SELECT 
      d.id, d.resident_id, d.amount, d.paid_amount, d.month, d.fiscal_year, d.status,
      c.name as head, r.block, r.flat_no, r.name, r.credit_balance
    FROM dues d
    JOIN residents r ON d.resident_id = r.id
    JOIN fee_categories c ON d.fee_category_id = c.id
    WHERE r.archived = 0
  `;
  if (residentId) duesQuery += ` AND d.resident_id = ${residentId}`;
  const dues = await db.select(duesQuery);
  
  let topupsQuery = `
    SELECT 
      t.id, t.resident_id, t.amount, t.source, t.transaction_id, t.transaction_date, t.created_at,
      r.block, r.flat_no, r.name
    FROM topups t
    JOIN residents r ON t.resident_id = r.id
  `;
  if (residentId) topupsQuery += ` AND t.resident_id = ${residentId}`;
  const topups = await db.select(topupsQuery);
  
  const monthMap = { "January":1, "February":2, "March":3, "April":4, "May":5, "June":6, "July":7, "August":8, "September":9, "October":10, "November":11, "December":12 };
  
  const events = [];
  
  dues.forEach(d => {
    let year = 1970;
    let mIdx = 1;
    if (d.fiscal_year && d.month) {
      mIdx = monthMap[d.month] || 1;
      const years = d.fiscal_year.split('-');
      if (years.length === 2) {
        year = parseInt(mIdx >= 4 ? years[0] : years[1]);
      }
    }
    const dateStr = `${year}-${String(mIdx).padStart(2, '0')}-01T00:00:00Z`;
    events.push({
      type: 'due',
      date: new Date(dateStr).getTime() || 0,
      timestamp: dateStr,
      data: d,
      resident_id: d.resident_id
    });
  });
  
  topups.forEach(t => {
    let rawDate = t.transaction_date || t.created_at || '';
    if (!rawDate.includes('T') && rawDate.includes(' ')) {
      rawDate = rawDate.replace(' ', 'T');
    }
    if (!rawDate.endsWith('Z') && rawDate.includes('T')) {
      rawDate += 'Z';
    }
    events.push({
      type: 'topup',
      date: new Date(rawDate).getTime() || 0,
      timestamp: rawDate,
      data: t,
      resident_id: t.resident_id
    });
  });
  
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date - b.date;
    return a.data.id - b.data.id;
  });
  
  const balances = {};
  
  events.forEach(e => {
    const resId = e.resident_id;
    if (balances[resId] === undefined) balances[resId] = 0;
    
    e.opening_balance = balances[resId];
    if (e.type === 'due') {
      balances[resId] += e.data.amount;
    } else {
      balances[resId] -= e.data.amount;
    }
    e.closing_balance = balances[resId];
  });
  
  return events;
}

export function getPeriodDates(fy, month) {
  let startDate = 0;
  let endDate = 999999999999999;
  
  if (fy !== 'All') {
    const startYear = parseInt(fy.split('-')[0]);
    if (month !== 'All') {
      const monthMap = { "January":1, "February":2, "March":3, "April":4, "May":5, "June":6, "July":7, "August":8, "September":9, "October":10, "November":11, "December":12 };
      const mIdx = monthMap[month] || 1;
      const year = mIdx >= 4 ? startYear : startYear + 1;
      startDate = new Date(`${year}-${String(mIdx).padStart(2, '0')}-01T00:00:00Z`).getTime();
      endDate = new Date(new Date(`${year}-${String(mIdx === 12 ? 1 : mIdx + 1).padStart(2, '0')}-01T00:00:00Z`).getTime() - 1).getTime();
    } else {
      startDate = new Date(`${startYear}-04-01T00:00:00Z`).getTime();
      endDate = new Date(`${startYear + 1}-03-31T23:59:59Z`).getTime();
    }
  }
  return { startDate, endDate };
}

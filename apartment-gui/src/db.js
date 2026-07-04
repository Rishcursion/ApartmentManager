import Database from "@tauri-apps/plugin-sql";

let db = null;
let initPromise = null;

export const DEFAULT_APARTMENT_LAYOUT = [
  { block: 'A', ranges: [[1, 15]] },
  { block: 'B', ranges: [[1, 12]] },
  { block: 'C', ranges: [[1, 11]] },
  { block: 'D', ranges: [[1, 16]] },
  { block: 'E', ranges: [[1, 11]] },
  { block: 'F', ranges: [[1, 12]] },
  { block: 'G', ranges: [[1, 15]] },
  { block: 'H', ranges: [[1, 14]] }
];

function expandApartmentLayout(layout = DEFAULT_APARTMENT_LAYOUT) {
  const flats = [];

  layout.forEach((blockConfig) => {
    const block = String(blockConfig.block || '').trim();
    if (!block) return;

    (blockConfig.ranges || []).forEach((range) => {
      const rangeConfig = Array.isArray(range) ? { from: range[0], to: range[1] } : range;
      const from = Number(rangeConfig.from);
      const to = Number(rangeConfig.to);
      if (!Number.isInteger(from) || !Number.isInteger(to)) return;

      const step = from <= to ? 1 : -1;
      for (let current = from; step > 0 ? current <= to : current >= to; current += step) {
        const flatNo = String(current).padStart(Number(rangeConfig.pad) || 0, '0');
        flats.push({
          block,
          flat_no: `${rangeConfig.prefix || ''}${flatNo}${rangeConfig.suffix || ''}`
        });
      }
    });

    (blockConfig.flats || []).forEach((flatNo) => {
      const normalizedFlat = String(flatNo || '').trim();
      if (normalizedFlat) flats.push({ block, flat_no: normalizedFlat });
    });
  });

  const seen = new Set();
  return flats.filter((flat) => {
    const key = `${flat.block}__${flat.flat_no}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseApartmentLayout(rawLayout) {
  if (!rawLayout) return DEFAULT_APARTMENT_LAYOUT;
  try {
    const parsed = JSON.parse(rawLayout);
    return Array.isArray(parsed) ? parsed : DEFAULT_APARTMENT_LAYOUT;
  } catch {
    return DEFAULT_APARTMENT_LAYOUT;
  }
}

export function getFiscalStartYear(fy) {
  if (!fy || fy === 'All') return null;
  const match = String(fy).match(/(\d{2,4})/);
  if (!match) return null;

  const rawYear = Number(match[1]);
  if (!Number.isFinite(rawYear)) return null;
  return rawYear < 100 ? 2000 + rawYear : rawYear;
}

export async function withTransaction(callback) {
  const db = await getDb();
  // Manual BEGIN/COMMIT causes deadlocks with tauri-plugin-sql connection pool
  // because each db.execute might be dispatched to a different connection.
  return await callback(db);
}

export async function recordTopup({ residentId, amount, source, transactionId = '', transactionDate = '' }) {
  if (!residentId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error('Invalid topup details');
  }

  return withTransaction(async (db) => {
    const duplicate = await db.select(
      `SELECT id FROM topups
       WHERE resident_id = ? AND amount = ? AND source = ? AND transaction_id = ? AND transaction_date = ?
       LIMIT 1`,
      [residentId, Number(amount), source, transactionId, transactionDate]
    );

    if (duplicate.length > 0) {
      return { inserted: false, id: duplicate[0].id };
    }

    await db.execute("UPDATE residents SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id = ?", [Number(amount), residentId]);
    await db.execute(
      "INSERT INTO topups (resident_id, amount, source, transaction_id, transaction_date) VALUES (?, ?, ?, ?, ?)",
      [residentId, Number(amount), source, transactionId, transactionDate]
    );
    return { inserted: true };
  });
}

export async function settleDue({ dueId, residentId, amount }) {
  if (!dueId || !residentId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error('Invalid settlement details');
  }

  return withTransaction(async (db) => {
    const dues = await db.select("SELECT amount, paid_amount FROM dues WHERE id = ?", [dueId]);
    const residents = await db.select("SELECT credit_balance FROM residents WHERE id = ?", [residentId]);
    if (dues.length === 0 || residents.length === 0) throw new Error('Due or resident not found');

    const totalDue = Number(dues[0].amount) || 0;
    const currentPaid = Number(dues[0].paid_amount) || 0;
    const availableCredit = Number(residents[0].credit_balance) || 0;
    const unsettled = Math.max(totalDue - currentPaid, 0);
    const amountToSettle = Math.min(Number(amount), availableCredit, unsettled);

    if (amountToSettle <= 0) throw new Error('No amount available to settle');

    const newPaid = currentPaid + amountToSettle;
    const newStatus = newPaid >= totalDue ? 'Paid' : 'Partial';
    await db.execute("UPDATE dues SET paid_amount = ?, status = ? WHERE id = ?", [newPaid, newStatus, dueId]);
    await db.execute("UPDATE residents SET credit_balance = COALESCE(credit_balance, 0) - ? WHERE id = ?", [amountToSettle, residentId]);

    return { amountSettled: amountToSettle, status: newStatus };
  });
}

export async function getApartmentLayout() {
  const db = await getDb();
  const rows = await db.select("SELECT value FROM app_settings WHERE key = 'apartment_layout'");
  return parseApartmentLayout(rows[0]?.value);
}

export async function saveApartmentLayout(layout) {
  const expanded = expandApartmentLayout(layout);
  if (expanded.length === 0) throw new Error('Apartment layout must contain at least one flat');

  await withTransaction(async (db) => {
    await db.execute(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('apartment_layout', ?)",
      [JSON.stringify(layout, null, 2)]
    );
    await syncResidentsWithApartmentLayout(db, layout);
  });
}

async function ensureApartmentLayoutSetting(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const rows = await db.select("SELECT value FROM app_settings WHERE key = 'apartment_layout'");
  if (rows.length === 0) {
    await db.execute(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('apartment_layout', ?)",
      [JSON.stringify(DEFAULT_APARTMENT_LAYOUT, null, 2)]
    );
  }
}

function mergeCsvValues(...values) {
  const seen = new Set();
  const merged = [];

  values.forEach((value) => {
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const key = item.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      });
  });

  return merged.join(',');
}

async function deduplicateResidents(db) {
  const duplicateGroups = await db.select(`
    SELECT block, flat_no, COUNT(*) as count
    FROM residents
    WHERE archived = 0
    GROUP BY block, flat_no
    HAVING COUNT(*) > 1
  `);

  for (const group of duplicateGroups) {
    const residents = await db.select(
      `SELECT id, name, contact, payment_handles, credit_balance
       FROM residents
       WHERE archived = 0 AND block = ? AND flat_no = ?
       ORDER BY id`,
      [group.block, group.flat_no]
    );
    if (residents.length <= 1) continue;

    const canonical =
      residents.find((resident) => resident.name && resident.name !== 'Unassigned') ||
      residents[0];
    const duplicates = residents.filter((resident) => resident.id !== canonical.id);

    for (const duplicate of duplicates) {
      await db.execute("UPDATE dues SET resident_id = ? WHERE resident_id = ?", [canonical.id, duplicate.id]);
      await db.execute("UPDATE topups SET resident_id = ? WHERE resident_id = ?", [canonical.id, duplicate.id]);
    }

    const bestName =
      canonical.name && canonical.name !== 'Unassigned'
        ? canonical.name
        : residents.find((resident) => resident.name && resident.name !== 'Unassigned')?.name || 'Unassigned';
    const bestContact = residents.find((resident) => resident.contact)?.contact || '';
    const paymentHandles = mergeCsvValues(...residents.map((resident) => resident.payment_handles));
    const totalCredit = residents.reduce((sum, resident) => sum + (Number(resident.credit_balance) || 0), 0);

    await db.execute(
      "UPDATE residents SET name = ?, contact = ?, payment_handles = ?, credit_balance = ? WHERE id = ?",
      [bestName, bestContact, paymentHandles, totalCredit, canonical.id]
    );

    for (const duplicate of duplicates) {
      await db.execute("UPDATE residents SET archived = 1, credit_balance = 0 WHERE id = ?", [duplicate.id]);
    }
  }
}

async function syncResidentsWithApartmentLayout(db, layout = DEFAULT_APARTMENT_LAYOUT) {
  const expectedFlats = expandApartmentLayout(layout);
  const expectedKeys = new Set(expectedFlats.map((flat) => `${flat.block}__${flat.flat_no}`));

  for (const flat of expectedFlats) {
    const existing = await db.select(
      "SELECT id FROM residents WHERE archived = 0 AND block = ? AND flat_no = ? LIMIT 1",
      [flat.block, flat.flat_no]
    );

    if (existing.length === 0) {
      await db.execute(
        "INSERT INTO residents (block, flat_no, name, contact, payment_handles, archived, credit_balance) VALUES (?, ?, 'Unassigned', '', '', 0, 0)",
        [flat.block, flat.flat_no]
      );
    }
  }

  const residents = await db.select(`
    SELECT r.id, r.block, r.flat_no, r.name, r.contact, r.payment_handles, r.credit_balance,
      COUNT(DISTINCT d.id) as due_count,
      COUNT(DISTINCT t.id) as topup_count
    FROM residents r
    LEFT JOIN dues d ON d.resident_id = r.id
    LEFT JOIN topups t ON t.resident_id = r.id
    WHERE r.archived = 0
    GROUP BY r.id
  `);

  for (const resident of residents) {
    const key = `${resident.block}__${resident.flat_no}`;
    const isUntouchedDefault =
      resident.name === 'Unassigned' &&
      !resident.contact &&
      !resident.payment_handles &&
      (Number(resident.credit_balance) || 0) === 0 &&
      Number(resident.due_count) === 0 &&
      Number(resident.topup_count) === 0;

    if (!expectedKeys.has(key) && isUntouchedDefault) {
      await db.execute("UPDATE residents SET archived = 1 WHERE id = ?", [resident.id]);
    }
  }
}

export async function initDb() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = initializeDb();
  try {
    db = await initPromise;
    return db;
  } finally {
    initPromise = null;
  }
}

async function initializeDb() {
  try {
    const database = await Database.load("sqlite:apartment.db");
    
    await database.execute(`
      CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block TEXT NOT NULL,
        flat_no TEXT NOT NULL,
        name TEXT NOT NULL,
        contact TEXT
      );
    `);
    
    try {
      await database.execute(`ALTER TABLE residents ADD COLUMN payment_handles TEXT`);
    } catch (e) {
      // Column already exists
    }

    try {
      await database.execute(`ALTER TABLE residents ADD COLUMN archived INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    try {
      await database.execute(`ALTER TABLE residents ADD COLUMN credit_balance REAL DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }
    
    await database.execute(`
      CREATE TABLE IF NOT EXISTS fee_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        archived INTEGER DEFAULT 0
      );
    `);
    
    try {
      await database.execute(`ALTER TABLE fee_categories ADD COLUMN is_variable INTEGER DEFAULT 0`);
    } catch (e) {}
    
    await database.execute(`
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
    
    await database.execute(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        amount REAL,
        ref_no TEXT,
        raw_narration TEXT
      );
    `);
    
    await database.execute(`
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
      await database.execute(`ALTER TABLE topups ADD COLUMN transaction_date TEXT`);
    } catch (e) {}

    await ensureApartmentLayoutSetting(database);
    await deduplicateResidents(database);
    await database.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_active_block_flat
      ON residents(block, flat_no)
      WHERE archived = 0
    `);
    
    const rows = await database.select("SELECT value FROM app_settings WHERE key = 'apartment_layout'");
    const layout = parseApartmentLayout(rows[0]?.value);
    await syncResidentsWithApartmentLayout(database, layout);
    await deduplicateResidents(database);

    return database;
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
  const params = [];
  if (residentId) {
    duesQuery += ` AND d.resident_id = ?`;
    params.push(residentId);
  }
  const dues = await db.select(duesQuery, params);
  
  let topupsQuery = `
    SELECT 
      t.id, t.resident_id, t.amount, t.source, t.transaction_id, t.transaction_date, t.created_at,
      r.block, r.flat_no, r.name
    FROM topups t
    JOIN residents r ON t.resident_id = r.id
    WHERE r.archived = 0
  `;
  const topupsParams = [];
  if (residentId) {
    topupsQuery += ` AND t.resident_id = ?`;
    topupsParams.push(residentId);
  }
  const topups = await db.select(topupsQuery, topupsParams);
  
  const monthMap = { "January":1, "February":2, "March":3, "April":4, "May":5, "June":6, "July":7, "August":8, "September":9, "October":10, "November":11, "December":12 };
  
  const events = [];
  
  dues.forEach(d => {
    let year = 1970;
    let mIdx = 1;
    if (d.fiscal_year && d.month) {
      mIdx = monthMap[d.month] || 1;
      const startYear = getFiscalStartYear(d.fiscal_year);
      if (startYear) year = mIdx >= 4 ? startYear : startYear + 1;
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
    const startYear = getFiscalStartYear(fy);
    if (!startYear) return { startDate, endDate };
    if (month !== 'All') {
      const monthMap = { "January":1, "February":2, "March":3, "April":4, "May":5, "June":6, "July":7, "August":8, "September":9, "October":10, "November":11, "December":12 };
      const mIdx = monthMap[month] || 1;
      const year = mIdx >= 4 ? startYear : startYear + 1;
      startDate = new Date(`${year}-${String(mIdx).padStart(2, '0')}-01T00:00:00Z`).getTime();
      const nextMonthYear = mIdx === 12 ? year + 1 : year;
      const nextMonth = mIdx === 12 ? 1 : mIdx + 1;
      endDate = new Date(new Date(`${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`).getTime() - 1).getTime();
    } else {
      startDate = new Date(`${startYear}-04-01T00:00:00Z`).getTime();
      endDate = new Date(`${startYear + 1}-03-31T23:59:59Z`).getTime();
    }
  }
  return { startDate, endDate };
}

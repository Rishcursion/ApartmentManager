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

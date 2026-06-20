import sqlite3
import os
from datetime import datetime

DB_FILE = 'apartment_manager.db'

def get_connection():
    return sqlite3.connect(DB_FILE)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Create Flats table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flats (
            flat_no TEXT PRIMARY KEY,
            owner_name TEXT,
            tenant_name TEXT,
            occupancy_status TEXT
        )
    ''')

    # Create Categories table
    try:
        cursor.execute("ALTER TABLE flats ADD COLUMN owner_phone TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE flats ADD COLUMN tenant_phone TEXT")
    except sqlite3.OperationalError:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE
        )
    ''')

    # Insert default categories if not exists
    default_categories = ['Maintenance', 'Water', 'Electricity', 'Sinking Fund']
    for cat in default_categories:
        cursor.execute('INSERT OR IGNORE INTO categories (name) VALUES (?)', (cat,))

    # Create Transactions table (for both dues and payments)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expense_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    ''')

    cursor.execute("SELECT COUNT(*) FROM expense_categories")
    if cursor.fetchone()[0] == 0:
        defaults = ["Repairs & Maintenance", "Electricity Bill", "Water Bill", "Salaries (Sweeper/Security)", "Miscellaneous"]
        for d in defaults:
            cursor.execute("INSERT OR IGNORE INTO expense_categories (name) VALUES (?)", (d,))

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            payment_mode TEXT,
            reference_no TEXT,
            notes TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flat_no TEXT,
            category_id INTEGER,
            type TEXT, -- 'DUE' or 'PAYMENT'
            amount REAL,
            date TEXT,
            payment_mode TEXT, -- 'Cash', 'Cheque', 'UPI', 'Bank Transfer', NULL for dues
            reference_no TEXT, -- UTR, Cheque No, etc.
            notes TEXT,
            FOREIGN KEY (flat_no) REFERENCES flats (flat_no),
            FOREIGN KEY (category_id) REFERENCES categories (id)
        )
    ''')

    conn.commit()
    conn.close()

# Helper functions
def execute_query(query, params=()):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    conn.commit()
    last_row_id = cursor.lastrowid
    conn.close()
    return last_row_id

def fetch_query(query, params=()):
    conn = get_connection()
    # Return dictionary-like rows
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return rows

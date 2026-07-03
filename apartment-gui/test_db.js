import Database from 'better-sqlite3';
const db = new Database('./src-tauri/sqlite.db');

const query = `
        SELECT 
          r.block, CAST(r.flat_no AS INTEGER) as flat_num, r.flat_no as flat, r.name,
          COALESCE(sq.total_due, 0) as total_due,
          COALESCE(sq.total_paid, 0) as total_paid
        FROM residents r
        LEFT JOIN (
          SELECT resident_id, SUM(amount) as total_due, SUM(paid_amount) as total_paid
          FROM dues d
          JOIN fee_categories c ON d.fee_category_id = c.id
          WHERE 1=1
          GROUP BY resident_id
        ) sq ON r.id = sq.resident_id
        WHERE r.archived = 0
        ORDER BY r.block, CAST(r.flat_no AS INTEGER)
`;
console.log(db.prepare(query).all());

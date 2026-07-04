import Database from "@tauri-apps/plugin-sql";
import { getDb, withTransaction } from "./db.js";

async function test() {
  try {
    const db = await getDb();
    
    // Create a dummy resident and category if not exist
    await db.execute("INSERT INTO fee_categories (name, type, amount, archived, is_variable) VALUES ('Test Cat', 'Monthly', 100, 0, 0)");
    const cats = await db.select("SELECT * FROM fee_categories ORDER BY id DESC LIMIT 1");
    const category = cats[0];
    
    await db.execute("INSERT INTO residents (block, flat_no, name, contact) VALUES ('Z', '999', 'Test', '')");
    const res = await db.select("SELECT * FROM residents ORDER BY id DESC LIMIT 1");
    const resident = res[0];

    console.log("Generating dues for", resident, category);

    await withTransaction(async (tx) => {
      await tx.execute(
        "INSERT INTO dues (resident_id, fee_category_id, month, fiscal_year, amount, status) VALUES (?, ?, ?, ?, ?, 'Unpaid')",
        [resident.id, category.id, 'January', '2026-27', 100]
      );
    });
    console.log("Success");
  } catch(e) {
    console.error("Error occurred:", e);
  }
}

test();

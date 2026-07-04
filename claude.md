# Apartment Manager AI Context (claude.md)

Welcome, fellow AI Assistant! This document contains the critical architectural patterns, database schemas, and technical gotchas for the Apartment Manager application. Please read this entirely before making changes to the codebase.

## Tech Stack
*   **Frontend**: React, built with Vite. Styling is done via vanilla CSS.
*   **Desktop Framework**: Tauri v2 (Rust).
*   **Database**: Local SQLite, accessed directly from the frontend using Tauri's SQL plugin (`@tauri-apps/plugin-sql`).

## Core Business Logic
The application manages financial records for an apartment society. It relies on a "Wallet / Advance Credit" system rather than direct bill-to-payment mappings:
1.  **Topups (Credits)**: When a resident pays money, it is recorded as a `topup` and their overall unallocated `credit_balance` in the `residents` table increases.
2.  **Dues (Debits)**: Monthly or ad-hoc bills are generated as `dues`.
3.  **Settlement**: When a due is settled, money is deducted from the resident's `credit_balance` and the due's `paid_amount` increases.
4.  **Chronological Ledger**: We compute point-in-time running balances using the `getResidentLedger()` engine in `src/db.js`. It interleaves all `dues` (Debits) and `topups` (Credits) into a single timeline with precise `Opening Balance` and `Closing Balance` values using standard `Dr` / `Cr` notation.

## Database Schema (`src/db.js`)
*   **`residents`**: `id`, `block`, `flat_no`, `name`, `credit_balance` (running unallocated funds), `archived`.
*   **`fee_categories`**: `id`, `name`, `type`, `amount`, `is_variable`, `archived`.
*   **`dues`**: `id`, `resident_id`, `fee_category_id`, `month`, `fiscal_year`, `amount` (billed), `paid_amount` (allocated so far), `status` ('Paid', 'Partial', 'Unpaid').
*   **`topups`**: `id`, `resident_id`, `amount`, `source`, `transaction_id`, `transaction_date`, `created_at`.

## ⚠️ CRITICAL GOTCHAS (READ CAREFULLY) ⚠️

1.  **Tauri v2 Permissions Structure**:
    *   Unlike Tauri v1, Tauri v2 strictly denies all plugin API calls by default.
    *   If you use a Tauri plugin (e.g., `dialog`, `fs`, `opener`, `sql`), you **MUST** ensure the exact capability is explicitly granted in `src-tauri/capabilities/default.json`.
    *   Example: Using `confirm()` requires `"dialog:allow-confirm"`. Exporting a file and opening it requires `"fs:allow-write-text-file"` and `"opener:allow-open-path" : [{"path": "**"}]`.

2.  **SQLite Ambiguous Columns**:
    *   The `amount` column exists in `dues`, `topups`, and `fee_categories`. When joining these tables, you **must explicitly alias** columns (e.g., `d.amount`, `c.amount`) or SQLite will throw `(code: 1) ambiguous column name: amount`.

3.  **Foreign Key Constraints**:
    *   `PRAGMA foreign_keys = ON` is enabled by default.
    *   If you write deletion or factory reset logic, you must delete child records (`topups`, `dues`) before deleting parent records (`residents`, `fee_categories`), or temporarily run `PRAGMA foreign_keys = OFF`.

4.  **Ledger Mathematics**:
    *   Do **NOT** use `dues.paid_amount` when building chronological financial statements or point-in-time bank statements. `paid_amount` represents *allocation*, not *receipt*.
    *   Always use `getResidentLedger()` from `db.js` which natively calculates precise running chronological balances (`+ Due.amount`, `- Topup.amount`) for the selected fiscal period.

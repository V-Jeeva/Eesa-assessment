# Architecture & Design Decisions

## 1. Why SQLite?

**For this assessment**, SQLite was the ideal choice because:

- **Zero Infrastructure**: No server process, no installation, no configuration. A single `askmetrics.db` file *is* the database. Any reviewer can clone the repo and run `python loader.py` to get a fully loaded database in under a second.
- **Portability**: The database file ships with the repo. There is no "works on my machine" problem.
- **Python Standard Library**: `sqlite3` is a built-in Python module — zero external database dependencies.
- **Read-Only Safety**: SQLite supports `?mode=ro` connection URIs, which enforces read-only access at the database engine level. Combined with our application-level SQL keyword blocking, this creates a defense-in-depth safety model.

**If the dataset were 1000x larger** (~2M+ orders, ~3M+ payments), I would choose **PostgreSQL** because:

- **Concurrency**: SQLite uses a file-level lock. Under concurrent web requests, writers block readers. PostgreSQL uses MVCC for true concurrent read/write.
- **Advanced Indexing**: Partial indexes, GIN/GiST indexes for full-text and JSONB queries, and BRIN indexes for time-series data (like `order_date`).
- **Query Planner**: PostgreSQL's cost-based optimizer handles complex JOINs, CTEs, and window functions far more efficiently at scale.
- **Materialized Views**: For expensive revenue roll-ups, materialized views can pre-compute totals and refresh periodically.
- **Connection Pooling**: Tools like PgBouncer allow hundreds of concurrent API users without overwhelming the database.
- **Managed Hosting**: Cloud-managed options (AWS RDS, Supabase, Neon) provide automatic backups, replication, and scaling.

---

## 2. Schema Design Choices

### Table Structure (3NF)
The schema follows a clean **Third Normal Form (3NF)** design with three tables:

| Table | Primary Key | Purpose |
|---|---|---|
| `users` | `user_id` (TEXT) | Customer master data, tier, wallet balance |
| `orders` | `order_id` (TEXT) | One row per order; links to user via FK |
| `payments` | `payment_id` (TEXT) | One row per payment attempt; links to order via FK |

**Why TEXT primary keys?** The CSV data uses prefixed string IDs (`U0001`, `O00001`, `P00001`). Casting these to INTEGER would lose the prefix and create confusion. TEXT keys preserve data fidelity.

### Data Types
- **DECIMAL(10, 2)** for all monetary fields (`gross_amount`, `discount_amount`, `amount`, `store_credit_used`, `wallet_balance`). This preserves financial precision. SQLite stores these as REAL internally but the schema declaration documents the intended precision.
- **DATE / TIMESTAMP** for temporal fields. SQLite stores these as TEXT but the type declaration enables `strftime()` queries and documents intent.
- **INTEGER** for `is_active` (0/1 boolean). SQLite has no native boolean type; integer is the conventional approach.

### Foreign Keys
- `orders.user_id → users.user_id`
- `payments.order_id → orders.order_id`

Foreign keys are enforced via `PRAGMA foreign_keys = ON` in `loader.py`. This is a deliberate design choice: orphaned orders (referencing non-existent users) and orphaned payments (referencing non-existent orders) are caught and logged to `rejects.txt` rather than silently loaded. **23 orphaned orders** and **44 orphaned payments** were caught and rejected this way.

---

## 3. Data Quality & Inconsistencies

This dataset contained multiple inconsistencies that required judgement calls.

### The Misleading Column Problem
Upon inspecting the CSV headers and cross-referencing with the data values:

| CSV File | CSV Column Name | Actual Meaning | Evidence |
|---|---|---|---|
| `orders.csv` | `credit` | **Discount coupon amount** | Values are small round numbers (50, 100, 200) applied at order time, consistent with promotional coupons, not account credit |
| `payments.csv` | `wallet_applied` | **Store credit used** | Values drawn down against user wallet balances, applied at payment time as a payment method offset |

### Tier Casing and Empty Values
- **Tier Casing**: The `tier` column in `users.csv` contains mixed casing (`bronze`, `Bronze`, `BRONZE`). Instead of mutating the raw data on load, I opted to ingest it as-is to preserve fidelity, but added a semantic hint in the system prompt instructing the LLM to use `LOWER(tier)` when aggregating or filtering.
- **Empty Values**: Some rows have empty `tier` or empty payment `method`. These were loaded as empty strings instead of `NULL` to reflect the raw CSV format. The LLM handles these transparently.

### Resolution
Rather than loading the data with misleading column names and hoping the LLM would guess correctly, I **renamed the columns at the schema level**:

- `orders.credit` → `orders.discount_amount` — Makes it unambiguous that this is a coupon/discount.
- `payments.wallet_applied` → `payments.store_credit_used` — Makes it clear this is wallet/credit balance being consumed.

The `loader.py` script performs this mapping:
```python
# orders: row['credit'] → database column 'discount_amount'
# payments: row['wallet_applied'] → database column 'store_credit_used'
```

### Impact on Revenue Calculations
This distinction is critical for correct revenue calculation:
- **Total Revenue** = Sum of `payments.amount` where `payments.status = 'captured'` and `orders.status NOT IN ('cancelled', 'returned')`.
- The `store_credit_used` is a supplementary payment method (money the customer had pre-loaded into their wallet). Whether it counts as "revenue" depends on business definition — the amount was already captured when the wallet was loaded.
- The `discount_amount` is a cost to the business (a coupon reduction) and is already excluded because `gross_amount` includes it pre-discount, but `payments.amount` reflects what was actually charged.

---

## 4. Data Loader Design (`loader.py`)

Key design principles:

1. **Idempotent / Re-runnable**: Uses `SELECT 1` existence checks before every INSERT. Running `loader.py` multiple times produces the same result.
2. **No Silent Failures**: Every failed INSERT is logged to `rejects.txt` with the primary key and error reason.
3. **Foreign Key Enforcement**: `PRAGMA foreign_keys = ON` ensures referential integrity. Orphaned records are rejected, not silently loaded.

---

## 5. Safety & Guardrails (`main.py`)

The application enforces multiple layers of protection:

| Layer | Mechanism | Purpose |
|---|---|---|
| LLM Prompt | Instruction to only write SELECT | First line of defense |
| Keyword Blocking | Rejects DROP, DELETE, INSERT, UPDATE, ALTER, COMMIT | Application-level blocklist |
| Multi-statement Blocking | Rejects queries with multiple semicolons | Prevents injection via stacked queries |
| Row Limit | Auto-appends `LIMIT 100` if missing | Prevents accidental full-table dumps |
| Read-Only Connection | `file:askmetrics.db?mode=ro` URI | SQLite engine-level enforcement |
| Query Timeout | `threading.Timer(10, conn.interrupt)` | Kills runaway or slow queries after 10s |
| Honest Refusal | LLM returns `REFUSAL:` prefix for unsafe/unanswerable questions | Graceful user-facing denial |
| Auto-Retry | On SQL execution error, re-prompts LLM with the error message (max 1 retry) | Self-healing for minor syntax issues |

---

## 6. Chart Rendering Rule

The brief requires that the chart type is selected "by a deterministic rule based on the shape of the result set — not by asking the model to pick."

My deterministic rule is implemented in `app.js` (`determineAndRenderChart`):
1. **Rule 1 (Bar/Line Chart)**: If the result set has exactly **2 columns**, and the second column is numeric (e.g., [Month, Revenue] or [Channel, Orders]), it renders a chart.
   - If the first column's name contains "date", "month", or "year", it renders a **Line Chart** to show trends.
   - Otherwise, it renders a **Bar Chart** to show distributions.
2. **Rule 2 (No Chart)**: For all other result shapes (e.g., 1 column, 3+ columns, or non-numeric 2nd column), it skips charting and only displays the data table.

---

## 7. What I Didn't Get To (Future Work)

If I had another day, I would focus on:
1. **Migration to PostgreSQL**: Setting up a proper relational database to handle realistic data volume and concurrency, moving away from SQLite's file-locking limitations.
2. **LLM Response Caching**: Implementing an LRU cache or Redis layer to store generated SQL for common natural-language questions, bypassing the ~2-second API latency.
3. **Advanced Visualizations**: Extending the charting rules to support Pie charts (for distributions totaling 100%), stacked bar charts for 3-column results (e.g., Revenue by Month by Channel), and DataTables-style pagination for large result sets.
4. **Vector Search for Semantic Columns**: Replacing explicit prompt hints with a RAG/embeddings approach where the schema and column definitions are retrieved dynamically based on the question vector, enabling the system to scale to hundreds of tables.

# AI Usage Log

This document details how AI tools were used during the development of this project, including what worked, what failed, and the decisions made as a result.

---

## 1. Core LLM Integration: Gemini API

### Initial Approach — Google SDK (`google.generativeai`)
The first attempt was to use the official `google-generativeai` Python SDK to call the Gemini API. This approach failed due to **dependency version mismatches**:

- The SDK's latest version required specific versions of `protobuf`, `grpcio`, and `google-auth` that conflicted with other installed packages.
- Older SDK versions did not support the newer Gemini model names.
- Multiple attempts to pin compatible versions in `requirements.txt` led to cascading dependency resolution failures.

### Pivot Decision — Raw REST API
After spending time debugging SDK version conflicts, the decision was made to **bypass the SDK entirely** and call the Gemini REST API directly using Python's `requests` library. This approach:

- **Eliminated all SDK dependencies** — only `requests` is needed, which has zero transitive dependency issues.
- **Made the integration transparent** — the exact HTTP request/response is visible in `query_llm()`, making debugging trivial.
- **Proved more robust** — the REST API endpoint is stable and does not change with SDK releases.

### Model Migration
During development, the API endpoint `models/gemini-2.5-flash` began returning `404 Not Found` with the message:
> *"This model is no longer available to new users. Please update your code to use models/gemini-3.6-flash."*

The model string was updated to `gemini-3.6-flash`, which resolved the issue. The `generationConfig` was also tuned with `temperature: 0.1` for deterministic SQL output.

### Response Parsing
The Gemini 3.6 Flash model returns responses with a `thoughtSignature` field alongside the text content (an artifact of the model's internal chain-of-thought). The response parser iterates over all parts and extracts only the `text` field, safely ignoring metadata. Any markdown fencing (` ```sql `) is stripped before returning the raw SQL.

---

## 2. AI-Assisted Development

### Code Generation
AI was used as a pair-programming assistant. Here are some of the exact prompts used to generate the critical parts of the solution:

- **System Prompt Generation**: *"Draft a system prompt for a data analyst LLM. It needs to know that the database uses SQLite, it can only write SELECT statements, and it must completely refuse any questions that try to modify data or ask questions outside the dataset. Give me just the prompt template where I can inject the schema."*
- **Frontend Chart logic**: *"I have an HTML table of SQL results. Write a vanilla JS function `determineAndRenderChart(columns, data)` that looks at the shape of the result. If it's 2 columns and the second is numeric, render a basic bar or line chart using Chart.js. If it's anything else, just return false."*
- **SQL Guardrails**: *"Write a Python function `execute_sql(query)` that takes a raw query string, uses sqlite3 to run it against 'askmetrics.db', but first strictly checks if there are multiple semicolons or any forbidden words like DROP or DELETE. It must run in read-only mode."*

### Data Analysis
AI assisted in:
- Identifying the `credit` vs `wallet_applied` column naming issue by analyzing value distributions and cross-referencing with business logic.
- Designing the schema column renaming strategy (`credit` → `discount_amount`, `wallet_applied` → `store_credit_used`).

### Evaluation Design
AI helped:
- Draft the 15 evaluation questions covering basic lookups, aggregations, JOINs, edge cases, and mandatory refusal questions.
- Write the `evals.py` automated test harness.
- Hand-calculate expected answers by running direct SQL queries against the loaded database.

---

## 3. What AI Could NOT Do (Errors & Rejections)

While AI accelerated development, it required constant oversight:

- **Rejected Suggestion (Silent Data Loading)**: The AI initially suggested a loader script that simply looped over CSV rows and used a broad `except Exception: continue` block to handle edge cases. I rejected this. *Reasoning*: Silent failures hide data quality issues. Instead, I wrote a loader that strictly enforced foreign keys and explicitly logged every rejected row to `rejects.txt`, which is how the missing user/order references were caught.
- **Error Caught (Incorrect Schema Inference)**: The AI initially looked at the CSV headers and assumed `orders.credit` was a customer account balance. *How I caught it*: I wrote manual SQL queries to analyze the distribution of `credit` values and noticed they were always round promotional numbers (50, 100). The AI got the business logic wrong. I corrected this by manually renaming the column to `discount_amount` in the schema so the AI wouldn't make the same mistake at runtime.
- **Fix the dependency hell**: AI suggested multiple package version pin combinations for the broken Google SDK, but none worked. Human judgement drove the decision to pivot to raw REST API calls.

---

## 4. Codebase Ownership Breakdown

As required by the brief, here is a transparent breakdown of who wrote what:

| Component | Authorship | Details |
|---|---|---|
| **Database Schema (`schema.sql`)** | Human | I mapped types, recognized the misleading column names, and added the indexes manually. |
| **Data Loader (`loader.py`)** | Human-led / AI-typed | I designed the logic (strict FKs, rejects logging), AI generated the boilerplate CSV parsing. |
| **Backend Guardrails (`main.py`)** | Human | Designing the read-only URI, thread-based timeout, and string-matching blocks were my architectural decisions. |
| **LLM Integration (`main.py`)** | AI-led / Human-fixed | AI generated the initial SDK logic (which failed), I rewrote it to use raw `requests`. |
| **Frontend Layout (HTML/CSS)** | AI largely | AI generated the clean, vanilla CSS layout based on my prompt for a modern, library-free design. |
| **Chart Logic (`app.js`)** | Human-led | The deterministic rule (2 columns = graph) was my rule; AI wrote the Chart.js implementation. |
| **Evaluation Suite (`evals.py` / `EVALS.md`)** | Mixed | I designed the test cases and wrote the hand-calculated SQL to get the right answers. AI wrote the Python test runner script. |

---

## 5. Tools Used

| Tool | Purpose |
|---|---|
| **Gemini 3.6 Flash** (via REST API) | Runtime LLM for natural-language-to-SQL translation |
| **AI Coding Assistant** | Pair programming, code review, evaluation design |
| **Python `requests`** | Direct HTTP calls to Gemini API (replacing the broken SDK) |

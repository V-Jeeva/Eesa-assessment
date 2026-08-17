# AskMetrics: Natural Language Analytics

A full-stack web application that translates plain English queries into safe, read-only SQL against a local SQLite database using the Gemini API.

## Requirements

1. **Python 3.9+**
2. **Gemini API Key** (from Google AI Studio)
3. The raw CSV data files (`users.csv`, `orders.csv`, `payments.csv`) must be placed in the root directory.

## Setup Instructions (From a Clean Machine)

### 1. Install Dependencies

Open a terminal in the project root and run:
```bash
pip install fastapi uvicorn requests python-dotenv pydantic
```
*(Note: Do not install `google-generativeai`. This project uses raw REST requests for reliability.)*

### 2. Configure Environment

Create a file named `.env` in the project root and add your Gemini API key:
```env
GEMINI_API_KEY=your_api_key_here
```

### 3. Load the Database

The database is powered by SQLite. To initialize the schema, perform data cleaning on the CSVs, and load the 3NF relationships, run:
```bash
python loader.py
```
This will:
- Create `askmetrics.db`
- Enforce foreign keys
- Write any dirty/orphaned rows to `rejects.txt` (you should see several dozen due to the raw dataset).

### 4. Start the Backend / Frontend

To spin up the FastAPI server (which statically serves the vanilla HTML/JS frontend):
```bash
uvicorn main:app --reload
```

### 5. Open the Application

Navigate your web browser to:
[http://localhost:8000/](http://localhost:8000/)

You will see the vanilla HTML/CSS/JS frontend.

## Evaluation Suite

To run the automated evaluation harness covering all 15 required edge cases/business questions:
1. Ensure the server is still running (`uvicorn main:app --reload`).
2. In a new terminal window, run:
```bash
python evals.py
```
You will get a pass/fail report for every required response format, mathematical aggregate, and safety refusal.

## Documentation

Please review the following markdown files as part of the assessment submission:
- **`DECISIONS.md`**: Architectural choices, schema design, data mappings, and the resolution of the `credit` vs `wallet_applied` discrepancy.
- **`AI_USAGE.md`**: Prompts, corrections, and AI limits.
- **`EVALS.md`**: Validation strategies for the 15 evaluation tests and hand-calculated SQL logic for expected results.

import sqlite3
import csv
import os

# 1. Connect to the database file (this creates askmetrics.db if it doesn't exist)
conn = sqlite3.connect('askmetrics.db')
cursor = conn.cursor()

# Turn on foreign keys so the database enforces our relationships
cursor.execute("PRAGMA foreign_keys = ON;")

# 2. Run our schema.sql to create the tables if they don't exist yet
with open('schema.sql', 'r') as file:
    cursor.executescript(file.read())

# 3. Open a text file to log any bad data (rejects.txt)
rejects_file = open('rejects.txt', 'w')

# This is a helper function to safely load a row and catch any errors
def process_row(table_name, primary_key_col, primary_key_val, insert_sql, values):
    # Check if the row is already in the database (handles the "re-runnable" rule)
    cursor.execute(f"SELECT 1 FROM {table_name} WHERE {primary_key_col} = ?", (primary_key_val,))
    if cursor.fetchone():
        return # Row exists, skip it cleanly

    # Try to insert the new data. If it fails, write to rejects.txt (handles the "no silent failures" rule)
    try:
        cursor.execute(insert_sql, values)
    except Exception as e:
        rejects_file.write(f"Failed to load into {table_name}: {primary_key_val} | Reason: {e}\n")

print("Starting to load data...")

# 4. Load Users
with open('users.csv', 'r') as file:
    reader = csv.DictReader(file)
    for row in reader:
        sql = """INSERT INTO users (user_id, full_name, email, signup_date, country, tier, is_active, wallet_balance) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
        vals = (row['user_id'], row['full_name'], row['email'], row['signup_date'], row['country'], row['tier'], row['is_active'], row['wallet_balance'])
        process_row('users', 'user_id', row['user_id'], sql, vals)
print("Users checked/loaded.")

# 5. Load Orders (Notice we are mapping the CSV 'credit' to our database 'discount_amount')
with open('orders.csv', 'r') as file:
    reader = csv.DictReader(file)
    for row in reader:
        sql = """INSERT INTO orders (order_id, user_id, order_date, status, gross_amount, discount_amount, currency, channel) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
        vals = (row['order_id'], row['user_id'], row['order_date'], row['status'], row['gross_amount'], row['credit'], row['currency'], row['channel'])
        process_row('orders', 'order_id', row['order_id'], sql, vals)
print("Orders checked/loaded.")

# 6. Load Payments (Notice we are mapping the CSV 'wallet_applied' to our database 'store_credit_used')
with open('payments.csv', 'r') as file:
    reader = csv.DictReader(file)
    for row in reader:
        sql = """INSERT INTO payments (payment_id, order_id, paid_at, method, amount, store_credit_used, status, currency) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
        vals = (row['payment_id'], row['order_id'], row['paid_at'], row['method'], row['amount'], row['wallet_applied'], row['status'], row['currency'])
        process_row('payments', 'payment_id', row['payment_id'], sql, vals)
print("Payments checked/loaded.")

# Save everything and close
conn.commit()
conn.close()
rejects_file.close()

print("Process finished! Check your folder for askmetrics.db and rejects.txt.")
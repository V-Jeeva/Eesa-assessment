-- 1. Users Table
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    signup_date DATE,
    country TEXT,
    tier TEXT,
    is_active INTEGER,
    wallet_balance DECIMAL(10, 2)
);

-- 2. Orders Table (Renamed 'credit' to 'discount_amount')
CREATE TABLE orders (
    order_id TEXT PRIMARY KEY,
    user_id TEXT,
    order_date DATE,
    status TEXT,
    gross_amount DECIMAL(10, 2),
    discount_amount DECIMAL(10, 2), 
    currency TEXT,
    channel TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 3. Payments Table (Renamed 'wallet_applied' to 'store_credit_used')
CREATE TABLE payments (
    payment_id TEXT PRIMARY KEY,
    order_id TEXT,
    paid_at TIMESTAMP,
    method TEXT,
    amount DECIMAL(10, 2),
    store_credit_used DECIMAL(10, 2),
    status TEXT,
    currency TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- 4. Indexes
-- FK lookup: JOINing orders to users (e.g. "top customers by spend")
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- FK lookup: JOINing payments to orders (e.g. revenue calculations)
CREATE INDEX idx_payments_order_id ON payments(order_id);

-- Filter: querying orders by status (e.g. excluding cancelled/returned)
CREATE INDEX idx_orders_status ON orders(status);

-- Filter: querying orders by date range (e.g. "orders in June 2026")
CREATE INDEX idx_orders_order_date ON orders(order_date);

-- Filter: querying payments by status (e.g. captured payments for revenue)
CREATE INDEX idx_payments_status ON payments(status);

-- Filter: querying users by country (e.g. "revenue by region")
CREATE INDEX idx_users_country ON users(country);
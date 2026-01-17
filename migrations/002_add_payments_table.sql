-- Create user_payments table
CREATE TABLE user_payments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_month DATE NOT NULL, -- First day of the month this payment covers
    status VARCHAR(20) CHECK (status IN ('pending', 'paid', 'overdue')) DEFAULT 'pending',
    payment_method VARCHAR(50),
    transaction_reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add payment_status and last_payment_date to users table
ALTER TABLE users 
ADD COLUMN payment_status VARCHAR(20) CHECK (payment_status IN ('active', 'overdue', 'blocked')) DEFAULT 'active',
ADD COLUMN last_payment_date TIMESTAMP,
ADD COLUMN next_payment_due DATE DEFAULT (CURRENT_DATE + INTERVAL '1 month')::date;

-- Create index for faster lookups
CREATE INDEX idx_user_payments_user_id ON user_payments(user_id);
CREATE INDEX idx_user_payments_status ON user_payments(status);
CREATE INDEX idx_user_payments_payment_month ON user_payments(payment_month);

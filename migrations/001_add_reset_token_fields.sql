-- Add reset_token and reset_token_expires columns to users table
ALTER TABLE users 
ADD COLUMN reset_token TEXT,
ADD COLUMN reset_token_expires TIMESTAMPTZ;

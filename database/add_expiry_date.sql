-- Add expiry_date column to members table if not exists
ALTER TABLE members ADD COLUMN expiry_date DATETIME;

-- Create index for better performance on expiry checks
CREATE INDEX IF NOT EXISTS idx_members_expiry ON members(expiry_date);
CREATE INDEX IF NOT EXISTS idx_members_status_expiry ON members(status, expiry_date);
-- Add invoice matching and alert tracking to bank_transactions

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS matched_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_status TEXT DEFAULT 'pending'
    CHECK (alert_status IN ('pending', 'matched', 'dismissed'));

-- Index for fast unmatched-credits queries
CREATE INDEX IF NOT EXISTS idx_banktx_unmatched
  ON bank_transactions(organization_id, alert_status)
  WHERE amount > 0;

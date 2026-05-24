-- ============================================================================
-- Accounting Module: invoice_items, payments, expenses
-- Note: invoices table already exists in schema.sql — we add new tables only
-- ============================================================================

-- Invoice line items (new)
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- Payments received (new)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_id UUID REFERENCES invoices(id),
  client_id UUID REFERENCES clients(id),
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT DEFAULT 'bank_transfer', -- bank_transfer, check, cash, credit_card
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expenses (new)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  matter_id UUID REFERENCES matters(id),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT DEFAULT 'general',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add new columns to existing invoices table (idempotent)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 18;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) DEFAULT 0;

-- Auto-increment invoice number sequence per organization
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1000;

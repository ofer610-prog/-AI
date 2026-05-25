-- WhatsApp bank transfer alerts table
CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  message_id TEXT,
  message_text TEXT NOT NULL,
  message_timestamp TIMESTAMPTZ NOT NULL,
  detected_amount NUMERIC(12,2),
  detected_client TEXT,
  client_id UUID REFERENCES clients(id),
  has_invoice BOOLEAN DEFAULT false,
  invoice_id UUID REFERENCES invoices(id),
  status TEXT DEFAULT 'pending', -- pending, resolved, dismissed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast org queries
CREATE INDEX IF NOT EXISTS whatsapp_alerts_org_status_idx
  ON whatsapp_alerts(organization_id, status);

-- Index for dedup by message_id
CREATE INDEX IF NOT EXISTS whatsapp_alerts_message_id_idx
  ON whatsapp_alerts(message_id);

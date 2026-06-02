-- WhatsApp transfer alerts table
-- Stores bank transfer confirmations detected in the office WhatsApp group

CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  message_text TEXT,
  message_timestamp TIMESTAMPTZ,
  detected_amount DECIMAL(12,2),
  detected_client TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  has_invoice BOOLEAN DEFAULT FALSE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_org
  ON whatsapp_alerts(organization_id, status);

ALTER TABLE whatsapp_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_alerts_all ON whatsapp_alerts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

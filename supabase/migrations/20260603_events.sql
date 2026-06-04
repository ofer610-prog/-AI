-- Events / appointments table for the law firm calendar

CREATE TABLE IF NOT EXISTS events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ,
  all_day          BOOLEAN DEFAULT false,
  location         TEXT,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  matter_id        UUID REFERENCES matters(id) ON DELETE SET NULL,
  attendee_name    TEXT,         -- external attendee (when client_id not known)
  attendee_phone   TEXT,
  event_type       TEXT DEFAULT 'meeting'
                   CHECK (event_type IN ('meeting','court','deadline','call','other')),
  status           TEXT DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','completed','cancelled')),
  reminder_sent    BOOLEAN DEFAULT false,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage events"
  ON events FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE INDEX idx_events_org_start ON events (organization_id, start_time);
CREATE INDEX idx_events_client    ON events (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_events_matter    ON events (matter_id) WHERE matter_id IS NOT NULL;

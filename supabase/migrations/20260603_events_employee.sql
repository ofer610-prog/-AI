-- Add assigned_to so each event belongs to a specific employee
ALTER TABLE events ADD COLUMN IF NOT EXISTS
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- sheet_row_id links events to their Google Sheets row for upsert/sync
ALTER TABLE events ADD COLUMN IF NOT EXISTS
  sheet_row_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_sheet_row
  ON events (organization_id, sheet_row_id)
  WHERE sheet_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_assigned ON events (assigned_to) WHERE assigned_to IS NOT NULL;

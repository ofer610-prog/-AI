-- Second Gmail account per organization.
-- The office scans two Gmail inboxes by the same credit-card last-4 rule:
--   gmail_*  = primary office mailbox (oferlaw12@gmail.com)
--   gmail2_* = dedicated invoices mailbox (Crlawtax@gmail.com)
-- Hotmail/Outlook scanning is being retired in favour of these two inboxes.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS gmail2_connected     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gmail2_refresh_token TEXT,   -- מוצפן ע"י Supabase
  ADD COLUMN IF NOT EXISTS gmail2_email         TEXT,
  ADD COLUMN IF NOT EXISTS last_gmail2_sync     TIMESTAMPTZ;

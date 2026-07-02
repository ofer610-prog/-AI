-- ============================================================================
-- Schema snapshot — tables that existed only in production until now.
-- These tables were created ad-hoc in the Supabase dashboard and were never
-- committed to the repo, so a rebuild from schema.sql + migrations would have
-- broken the app. Definitions below were dumped from production (2026-07-02).
-- All statements are IF NOT EXISTS — safe to run against production.
-- ============================================================================

-- ── tasks — משימות (dashboard, /tasks, attorney digest) ─────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  task_number TEXT,
  task_type TEXT,
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT DEFAULT 'open',          -- open | in_progress | done | cancelled
  priority TEXT DEFAULT 'medium',      -- low | medium | high
  completed_at DATE,
  notes TEXT,
  sheet_row_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── time_entries — שעתון (TimeTracker) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  description TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── notifications — פעמון התראות ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new',  -- new | seen | ack
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ack_at TIMESTAMPTZ
);

-- ── office_expenses — מטריצת הוצאות משרד (/expenses) ────────────────────────
CREATE TABLE IF NOT EXISTS office_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section TEXT NOT NULL DEFAULT 'office',
  item_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  is_itemized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, section, item_name, year, month)
);

-- ── integration_settings — הגדרות אינטגרציה (PIN לתיקים, WhatsApp...) ───────
CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── credit_charges — חיובי אשראי מ-SMS (/credit-charges) ────────────────────
CREATE TABLE IF NOT EXISTS credit_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  charge_date DATE,
  amount NUMERIC(12,2),
  vendor TEXT,
  card_last4 TEXT,
  raw_sms TEXT,
  matched_doc_id UUID,
  alert_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── case_custom_columns — עמודות מותאמות במודול התיקים ──────────────────────
CREATE TABLE IF NOT EXISTS case_custom_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  col_type TEXT NOT NULL DEFAULT 'text',
  options JSONB,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── expense_documents — מסמכי הוצאות (סריקת מייל, OCR, העלאות) ──────────────
CREATE TABLE IF NOT EXISTS expense_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  amount NUMERIC,
  vendor TEXT,
  description TEXT,
  category TEXT DEFAULT 'general',
  doc_date DATE DEFAULT CURRENT_DATE,
  month TEXT,
  status TEXT DEFAULT 'pending',  -- pending|approved|rejected|linked|needs_review|duplicate_review|imported|removed
  accountant_notes TEXT,
  expense_item TEXT,
  expense_section TEXT,
  expense_year INTEGER,
  expense_month_num INTEGER,
  gmail_message_id TEXT,
  payer TEXT NOT NULL DEFAULT 'office',  -- office | client | unknown
  allocation_number TEXT,
  vat_deductible BOOLEAN DEFAULT false,
  supplier_type TEXT,
  vat NUMERIC,
  doc_number TEXT,
  currency TEXT NOT NULL DEFAULT 'ILS',
  original_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── attorney_digests — לוג שליחת סיכום בוקר לעו"ד (cron attorney-digest) ────
-- (הוחל על פרודקשן ב-2026-07-02 — הטבלה לא הייתה קיימת וה-cron נכשל בשקט)
CREATE TABLE IF NOT EXISTS attorney_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lawyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overdue_tasks INTEGER DEFAULT 0,
  open_tasks INTEGER DEFAULT 0,
  upcoming_deliveries INTEGER DEFAULT 0,
  overdue_deliveries INTEGER DEFAULT 0,
  collection_cases INTEGER DEFAULT 0,
  wa_sent BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attorney_digests_org_lawyer_idx
  ON attorney_digests (organization_id, lawyer_id, sent_at DESC);

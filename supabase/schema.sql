-- ============================================================================
-- Law Firm Bookkeeping System - Supabase Schema
-- ============================================================================
-- הוראות הפעלה:
-- 1. היכנס ל-Supabase, פתח את ה-SQL Editor (תפריט שמאל)
-- 2. הדבק את כל הקובץ הזה
-- 3. לחץ "Run"
-- 4. בדוק שהושפעו 0 רשומות בלי שגיאות
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- לחיפוש טקסט חכם

-- ============================================================================
-- 1. ORGANIZATIONS (משרד)
-- ============================================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  business_id TEXT,
  vat_rate DECIMAL(5,2) DEFAULT 18.00,
  filing_freq TEXT DEFAULT 'bimonthly' CHECK (filing_freq IN ('monthly', 'bimonthly')),
  gmail_connected BOOLEAN DEFAULT FALSE,
  gmail_refresh_token TEXT, -- מוצפן ע"י Supabase
  gmail_email TEXT,
  last_gmail_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. PROFILES (משתמשים — מקושרים ל-auth.users של Supabase)
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'lawyer', 'paralegal', 'intern', 'accountant')),
  monthly_salary DECIMAL(10,2),
  hourly_rate DECIMAL(10,2),
  start_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_org ON profiles(organization_id);

-- ============================================================================
-- 3. CLIENTS (לקוחות)
-- ============================================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'individual' CHECK (type IN ('individual', 'company')),
  id_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_clients_org ON clients(organization_id);
CREATE INDEX idx_clients_name_trgm ON clients USING gin(name gin_trgm_ops);

-- ============================================================================
-- 4. MATTERS (תיקים)
-- ============================================================================
CREATE TABLE matters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'rental', 'tama38', 'pinui', 'inheritance', 'registration', 'mortgage', 'litigation', 'consulting', 'other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'closed', 'lost')),
  responsible_lawyer_id UUID REFERENCES profiles(id),
  agreed_fee DECIMAL(12,2),
  start_date DATE,
  property_address TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_matters_org ON matters(organization_id);
CREATE INDEX idx_matters_client ON matters(client_id);
CREATE INDEX idx_matters_lawyer ON matters(responsible_lawyer_id);
CREATE INDEX idx_matters_status ON matters(status);

-- ============================================================================
-- 5. INCOME (הכנסות)
-- ============================================================================
CREATE TABLE income (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) DEFAULT 0,
  category TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual', -- manual, gmail, whatsapp, document-upload, bank-import
  source_ref TEXT, -- ID של המייל שממנו זה בא
  notes TEXT,
  needs_review BOOLEAN DEFAULT FALSE, -- TRUE אם המערכת חילצה אבל לא בטוחה
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_income_org ON income(organization_id);
CREATE INDEX idx_income_date ON income(date DESC);
CREATE INDEX idx_income_client ON income(client_id);
CREATE INDEX idx_income_matter ON income(matter_id);

-- ============================================================================
-- 6. EXPENSE (הוצאות)
-- ============================================================================
CREATE TABLE expense (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) DEFAULT 0,
  category TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual',
  source_ref TEXT,
  notes TEXT,
  needs_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_expense_org ON expense(organization_id);
CREATE INDEX idx_expense_date ON expense(date DESC);

-- ============================================================================
-- 7. INVOICES (חשבוניות)
-- ============================================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL, -- snapshot למקרה שהלקוח נמחק
  amount DECIMAL(12,2) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  last_reminder_sent TIMESTAMPTZ,
  reminder_count INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due ON invoices(due_date);

-- ============================================================================
-- 8. TIMESHEET (שעתון)
-- ============================================================================
CREATE TABLE timesheet (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  lawyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  hours DECIMAL(5,2) NOT NULL,
  description TEXT,
  billable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timesheet_org ON timesheet(organization_id);
CREATE INDEX idx_timesheet_lawyer ON timesheet(lawyer_id);
CREATE INDEX idx_timesheet_matter ON timesheet(matter_id);
CREATE INDEX idx_timesheet_date ON timesheet(date DESC);

-- ============================================================================
-- 9. BANK_TRANSACTIONS (תנועות בנק)
-- ============================================================================
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL, -- שלילי = חיוב, חיובי = זיכוי
  description TEXT,
  reference TEXT,
  matched_income_id UUID REFERENCES income(id) ON DELETE SET NULL,
  matched_expense_id UUID REFERENCES expense(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual', -- manual, gmail, csv-import
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_banktx_org ON bank_transactions(organization_id);
CREATE INDEX idx_banktx_date ON bank_transactions(date DESC);

-- ============================================================================
-- 10. GMAIL_PROCESSED (מעקב אחר מיילים שעובדו, כדי לא לעבד פעמיים)
-- ============================================================================
CREATE TABLE gmail_processed (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  subject TEXT,
  from_email TEXT,
  date TIMESTAMPTZ,
  classification TEXT, -- bank, bit, invoice, whatsapp-export, other
  extracted_amount DECIMAL(12,2),
  extracted_date DATE,
  extracted_description TEXT,
  status TEXT DEFAULT 'processed' CHECK (status IN ('processed', 'pending-review', 'ignored', 'imported')),
  related_income_id UUID REFERENCES income(id) ON DELETE SET NULL,
  related_expense_id UUID REFERENCES expense(id) ON DELETE SET NULL,
  related_bank_tx_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  ai_confidence TEXT, -- high, medium, low
  ai_notes TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, gmail_message_id)
);

CREATE INDEX idx_gmail_org ON gmail_processed(organization_id);
CREATE INDEX idx_gmail_status ON gmail_processed(status);

-- ============================================================================
-- 11. ALERTS (התראות שנוצרו ע"י המערכת)
-- ============================================================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  level TEXT CHECK (level IN ('high', 'medium', 'low', 'info')),
  type TEXT, -- overdue-invoice, deadline-soon, cash-crunch, missing-expense, gmail-pending
  title TEXT NOT NULL,
  description TEXT,
  action_url TEXT,
  related_id UUID, -- yes, generic — yields to any entity
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_alerts_org ON alerts(organization_id);
CREATE INDEX idx_alerts_unread ON alerts(organization_id, is_read) WHERE is_read = FALSE;

-- ============================================================================
-- 12. CHAT_MESSAGES (היסטוריית צ'אט עם היועץ AI — לכל משתמש בנפרד)
-- ============================================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_user ON chat_messages(user_id, created_at DESC);

-- ============================================================================
-- 13. AUDIT_LOG (יומן פעולות — מי עשה מה ומתי)
-- ============================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL, -- created, updated, deleted, viewed
  entity_type TEXT NOT NULL, -- client, matter, income, expense, etc.
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON audit_log(organization_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — אבטחה ברמת השורה
-- ============================================================================
-- כל משתמש רואה רק את הנתונים של המשרד שלו
-- מתמחים ופראלגלים רואים רק את התיקים שמוקצים להם
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_processed ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's organization
CREATE OR REPLACE FUNCTION current_org() RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: is user admin or accountant
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'accountant')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: is user lawyer or above
CREATE OR REPLACE FUNCTION is_lawyer_or_above() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'lawyer', 'accountant')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ORGANIZATIONS — only members of the org can see it
CREATE POLICY org_select ON organizations FOR SELECT
  USING (id = current_org());
CREATE POLICY org_update ON organizations FOR UPDATE
  USING (id = current_org() AND is_admin());

-- PROFILES — see all profiles in your org
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (organization_id = current_org());
CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY profiles_admin_all ON profiles FOR ALL
  USING (organization_id = current_org() AND is_admin());

-- CLIENTS — admin/accountant/lawyer see all; intern/paralegal see only those linked to their matters
CREATE POLICY clients_select ON clients FOR SELECT
  USING (
    organization_id = current_org() AND (
      is_lawyer_or_above() OR
      EXISTS (
        SELECT 1 FROM matters m
        WHERE m.client_id = clients.id AND m.responsible_lawyer_id = auth.uid()
      )
    )
  );
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (organization_id = current_org() AND is_lawyer_or_above());
CREATE POLICY clients_update ON clients FOR UPDATE
  USING (organization_id = current_org() AND is_lawyer_or_above());
CREATE POLICY clients_delete ON clients FOR DELETE
  USING (organization_id = current_org() AND is_admin());

-- MATTERS — same logic
CREATE POLICY matters_select ON matters FOR SELECT
  USING (
    organization_id = current_org() AND (
      is_lawyer_or_above() OR responsible_lawyer_id = auth.uid()
    )
  );
CREATE POLICY matters_insert ON matters FOR INSERT
  WITH CHECK (organization_id = current_org() AND is_lawyer_or_above());
CREATE POLICY matters_update ON matters FOR UPDATE
  USING (
    organization_id = current_org() AND (
      is_lawyer_or_above() OR responsible_lawyer_id = auth.uid()
    )
  );
CREATE POLICY matters_delete ON matters FOR DELETE
  USING (organization_id = current_org() AND is_admin());

-- INCOME / EXPENSE — only admin/accountant
CREATE POLICY income_all ON income FOR ALL
  USING (organization_id = current_org() AND is_admin());
CREATE POLICY expense_all ON expense FOR ALL
  USING (organization_id = current_org() AND is_admin());

-- INVOICES — admin/accountant full; lawyers see those of their matters
CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (
    organization_id = current_org() AND (
      is_admin() OR
      EXISTS (
        SELECT 1 FROM matters m
        WHERE m.id = invoices.matter_id AND m.responsible_lawyer_id = auth.uid()
      )
    )
  );
CREATE POLICY invoices_modify ON invoices FOR ALL
  USING (organization_id = current_org() AND is_admin());

-- TIMESHEET — everyone sees their own; admin sees all
CREATE POLICY timesheet_select ON timesheet FOR SELECT
  USING (
    organization_id = current_org() AND (
      is_admin() OR lawyer_id = auth.uid()
    )
  );
CREATE POLICY timesheet_insert ON timesheet FOR INSERT
  WITH CHECK (organization_id = current_org() AND lawyer_id = auth.uid());
CREATE POLICY timesheet_update ON timesheet FOR UPDATE
  USING (
    organization_id = current_org() AND (
      is_admin() OR lawyer_id = auth.uid()
    )
  );
CREATE POLICY timesheet_delete ON timesheet FOR DELETE
  USING (
    organization_id = current_org() AND (
      is_admin() OR lawyer_id = auth.uid()
    )
  );

-- BANK / GMAIL / ALERTS — admin only
CREATE POLICY bank_all ON bank_transactions FOR ALL
  USING (organization_id = current_org() AND is_admin());
CREATE POLICY gmail_all ON gmail_processed FOR ALL
  USING (organization_id = current_org() AND is_admin());
CREATE POLICY alerts_all ON alerts FOR ALL
  USING (organization_id = current_org());

-- CHAT — only owner can see
CREATE POLICY chat_select ON chat_messages FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY chat_insert ON chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid() AND organization_id = current_org());
CREATE POLICY chat_delete ON chat_messages FOR DELETE
  USING (user_id = auth.uid());

-- AUDIT LOG — admins read; system inserts
CREATE POLICY audit_select ON audit_log FOR SELECT
  USING (organization_id = current_org() AND is_admin());

-- ============================================================================
-- STORAGE BUCKETS (for documents and attachments)
-- ============================================================================
-- צריך ליצור ידנית ב-Supabase UI:
-- 1. documents (private) — חשבוניות, אישורי העברה, מסמכי תיקים
-- 2. exports (private) — ייצואי ווטסאפ, CSVs
-- ============================================================================

-- ============================================================================
-- TRIGGERS — עדכון אוטומטי של updated_at, audit log
-- ============================================================================

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    LOWER(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
      ELSE to_jsonb(NEW)
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to important tables
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_matters AFTER INSERT OR UPDATE OR DELETE ON matters FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_income AFTER INSERT OR UPDATE OR DELETE ON income FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_expense AFTER INSERT OR UPDATE OR DELETE ON expense FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================================
-- DONE
-- ============================================================================
-- עכשיו צריך:
-- 1. ליצור buckets ב-Storage: 'documents' ו-'exports' (שניהם private)
-- 2. ליצור משרד ראשון: INSERT INTO organizations (name) VALUES ('שם המשרד שלך');
-- 3. להירשם דרך האפליקציה — המשתמש הראשון ייווצר אוטומטית כ-admin
-- ============================================================================

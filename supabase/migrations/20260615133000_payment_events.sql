create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  event_date date not null,
  merchant_name text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'ILS',
  payment_tail text,
  source text not null default 'manual_text',
  source_text text,
  source_message_id text,
  category text,
  match_status text not null default 'missing_document',
  matched_expense_document_id uuid references public.expense_documents(id) on delete set null,
  confidence numeric(5,2),
  notes text,
  ignored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source, source_message_id)
);

create index if not exists payment_events_org_date_idx on public.payment_events (organization_id, event_date desc);
create index if not exists payment_events_org_status_idx on public.payment_events (organization_id, match_status);
create index if not exists payment_events_org_amount_idx on public.payment_events (organization_id, amount);

alter table public.payment_events enable row level security;

drop policy if exists payment_events_org_access on public.payment_events;
create policy payment_events_org_access on public.payment_events
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = payment_events.organization_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = payment_events.organization_id
    )
  );

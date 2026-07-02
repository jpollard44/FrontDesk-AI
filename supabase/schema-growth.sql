-- FrontDesk AI — Growth engine (in-house lead gen + outreach)
-- Additive migration; run after schema.sql.

-- Optional but recommended: fuzzy business-name dedup support.
create extension if not exists pg_trgm;

-- Enrichment + qualification columns on leads
alter table leads add column if not exists email text;
alter table leads add column if not exists contact_name text;          -- owner / office manager if found
alter table leads add column if not exists score int;                  -- 0-100 qualification score
alter table leads add column if not exists phone_normalized text;      -- digits only, for dedup
alter table leads add column if not exists name_normalized text;       -- lowercased, suffix-stripped
alter table leads add column if not exists place_id text;              -- Google Place ID
alter table leads add column if not exists has_chat_widget boolean;
alter table leads add column if not exists competitor text;            -- detected existing AI receptionist vendor

-- Dedup guarantees (no wasted outreach across runs)
create unique index if not exists uq_leads_place_id on leads(place_id) where place_id is not null;
create unique index if not exists uq_leads_phone on leads(phone_normalized) where phone_normalized is not null;
create unique index if not exists uq_leads_name_city on leads(name_normalized, city)
  where name_normalized is not null and city is not null;
create index if not exists idx_leads_name_trgm on leads using gin (name_normalized gin_trgm_ops);

-- One outreach sequence per lead: the 5-touch / 14-day email cadence,
-- generated up front by Claude and drained by the outreach cron.
create table if not exists sequences (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null unique references leads(id) on delete cascade,
  demo_slug         text,
  touches           jsonb not null,                 -- [{day, subject, body}]
  current_step      int not null default 0,
  next_send_at      timestamptz,
  status            text not null default 'ready',  -- ready, active, completed, suppressed, stopped
  unsubscribe_token text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_sequences_due on sequences(next_send_at) where status in ('ready','active');

-- CAN-SPAM: permanent do-not-contact list. Checked before every send.
create table if not exists suppression_list (
  email_lower text primary key,
  reason      text not null,                        -- unsubscribed, bounced, complaint, manual
  created_at  timestamptz not null default now()
);

alter table sequences        enable row level security;
alter table suppression_list enable row level security;

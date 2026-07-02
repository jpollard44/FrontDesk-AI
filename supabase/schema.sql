-- FrontDesk AI — Supabase schema
-- Run in the Supabase SQL editor (or via supabase db push).

create extension if not exists "pgcrypto";

-- Lead pipeline: sourced → enriched → demo_built → contacted → visited_demo → client → dead
create type lead_status as enum (
  'sourced', 'enriched', 'demo_built', 'contacted', 'visited_demo', 'client', 'dead'
);

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  website       text,
  phone         text,
  city          text,
  niche         text,               -- dentist, hvac, med_spa, plumber, ...
  review_count  int,
  rating        numeric(2,1),
  gap_notes     text,               -- detected gaps: no chat widget, no after-hours contact, ...
  hook_sentence text,               -- personalized outreach opener
  status        lead_status not null default 'sourced',
  source        text,               -- outscraper, manual, ...
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists demos (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references leads(id) on delete set null,
  slug            text not null unique,
  config          jsonb not null,    -- BusinessConfig (see src/lib/config.ts)
  expires_at      timestamptz not null default now() + interval '14 days',
  message_count   int not null default 0,
  last_visited_at timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists clients (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid references leads(id) on delete set null,
  stripe_customer_id text unique,
  stripe_sub_id      text unique,
  config             jsonb not null,
  status             text not null default 'active',  -- active, past_due, canceled
  embed_key          text not null unique,
  notify_email       text,
  notify_phone       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients(id) on delete cascade,
  demo_id    uuid references demos(id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,  -- [{role, content, at}]
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or demo_id is not null)
);

create table if not exists captured_leads (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  demo_id     uuid references demos(id) on delete cascade,
  name        text not null,
  phone       text not null,
  reason      text,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists outreach_log (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  channel     text not null,          -- email, walk_in, ...
  template_id text,
  sent_at     timestamptz not null default now(),
  opened      boolean not null default false,
  clicked     boolean not null default false,
  replied     boolean not null default false,
  opted_out   boolean not null default false  -- CAN-SPAM: suppress permanently when true
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_demos_slug on demos(slug);
create index if not exists idx_demos_expires on demos(expires_at);
create index if not exists idx_clients_embed_key on clients(embed_key);
create index if not exists idx_captured_leads_client on captured_leads(client_id);
create index if not exists idx_outreach_lead on outreach_log(lead_id);

-- Row-level security: all access goes through the server with the service-role
-- key, so lock everything down for anon/authenticated roles.
alter table leads          enable row level security;
alter table demos          enable row level security;
alter table clients        enable row level security;
alter table conversations  enable row level security;
alter table captured_leads enable row level security;
alter table outreach_log   enable row level security;

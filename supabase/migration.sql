-- Plan de implementación Humand: tablas
create table if not exists public.plans (
  id text primary key,
  client_name text not null,
  data jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.plans(id) on delete cascade,
  task_id text,
  kind text not null default 'task',          -- task | manual | digest
  recipients text[] not null default '{}',
  cc text[] not null default '{}',
  subject text,
  body text,
  send_at timestamptz not null,
  status text not null default 'scheduled',   -- scheduled | sent | skipped | failed
  sent_at timestamptz,
  error text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (status, send_at);
create index if not exists reminders_plan_idx on public.reminders (plan_id);

-- Seguridad: RLS activo y SIN políticas → nadie con la anon key puede leer ni escribir.
-- Solo las funciones del servidor (service role) acceden.
alter table public.plans enable row level security;
alter table public.reminders enable row level security;

-- v3: cada plan tiene dueño, se puede compartir y queda historial de cambios
alter table public.plans add column if not exists owner_email text;
create index if not exists plans_owner_idx on public.plans (owner_email);

create table if not exists public.plan_shares (
  plan_id text not null references public.plans(id) on delete cascade,
  email text not null,
  role text not null default 'edit',      -- edit | view
  expires_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  primary key (plan_id, email)
);
create index if not exists plan_shares_email_idx on public.plan_shares (email);

create table if not exists public.plan_activity (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.plans(id) on delete cascade,
  actor text,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists plan_activity_plan_idx on public.plan_activity (plan_id, created_at desc);

alter table public.plan_shares enable row level security;
alter table public.plan_activity enable row level security;

-- v4: copia semanal de "Humand Product Updates" (Notion) para usar sin NOTION_TOKEN
create table if not exists public.product_updates (
  id text primary key,
  title text not null,
  module text,
  type text,
  date date,
  descr text,
  url text,
  synced_at timestamptz not null default now()
);
create index if not exists product_updates_date_idx on public.product_updates (date desc);
alter table public.product_updates enable row level security;

-- v5: una sola fila por novedad (en Notion hay páginas cargadas dos veces)
alter table public.product_updates add column if not exists dedupe_key text generated always as (coalesce(module,'') || '|' || lower(btrim(title))) stored;
create unique index if not exists product_updates_dedupe_key_idx on public.product_updates (dedupe_key);

-- v6: traspasos por vacaciones, credenciales por persona y bandeja de minutas de Fathom
alter table public.plan_shares
  add column if not exists handoff boolean not null default false,
  add column if not exists starts_at date,
  add column if not exists priority text,
  add column if not exists info text,
  add column if not exists cards text,
  add column if not exists format text,
  add column if not exists return_notes text,
  add column if not exists updated_at timestamptz;
create index if not exists plan_shares_handoff_idx on public.plan_shares (handoff) where handoff;

create table if not exists public.user_settings (
  email text primary key,
  cred_user text,
  cred_pass_enc text,          -- cifrada (AES-256-GCM) con una clave derivada de SESSION_SECRET
  cmb_url text,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;

create table if not exists public.plan_inbox (
  id text primary key,         -- p. ej. fathom:<recording_id>:<plan_id>
  plan_id text not null references public.plans(id) on delete cascade,
  kind text not null,          -- minuta | format
  payload jsonb not null,
  created_at timestamptz not null default now(),
  imported_at timestamptz
);
create index if not exists plan_inbox_plan_idx on public.plan_inbox (plan_id) where imported_at is null;
alter table public.plan_inbox enable row level security;

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

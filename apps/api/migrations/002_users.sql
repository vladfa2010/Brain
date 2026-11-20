-- Пользователи, сессии и изоляция данных
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  password_hash   text not null,
  name            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_login_at   timestamptz,
  failed_attempts integer not null default 0,
  locked_until    timestamptz
);
create unique index if not exists users_email_norm_idx on users (lower(email));

create table if not exists refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   text not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  replaced_by  uuid,
  user_agent   text,
  ip           text,
  created_at   timestamptz not null default now()
);
create index if not exists refresh_tokens_user_idx on refresh_tokens (user_id);
create index if not exists refresh_tokens_hash_idx on refresh_tokens (token_hash);

-- Владение данными
alter table areas      add column if not exists user_id uuid references users(id) on delete cascade;
alter table projects   add column if not exists user_id uuid references users(id) on delete cascade;
alter table cards      add column if not exists user_id uuid references users(id) on delete cascade;
alter table briefs     add column if not exists user_id uuid references users(id) on delete cascade;
alter table agent_runs add column if not exists user_id uuid references users(id) on delete cascade;

create index if not exists areas_user_idx      on areas (user_id);
create index if not exists projects_user_idx   on projects (user_id);
create index if not exists cards_user_idx      on cards (user_id);
create index if not exists briefs_user_idx     on briefs (user_id);
create index if not exists agent_runs_user_idx on agent_runs (user_id);

-- брифы: один на пользователя в день
alter table briefs drop constraint if exists briefs_day_key;
create unique index if not exists briefs_user_day_idx on briefs (user_id, day);

-- настройки: ключ в рамках пользователя
alter table settings add column if not exists user_id uuid references users(id) on delete cascade;
delete from settings where user_id is null;
alter table settings drop constraint if exists settings_pkey;
alter table settings add primary key (user_id, key);

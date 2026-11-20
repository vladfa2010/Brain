-- SecondBrain: базовая схема
create extension if not exists pgcrypto;
create extension if not exists vector;

-- ── области жизни ────────────────────────────────────────────────
create table if not exists areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  glyph       text not null default '•',          -- emoji или короткий символ
  hue         text not null default 'sand',        -- ключ палитры
  sort_order  double precision not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ── проекты (временные, с финишем) ───────────────────────────────
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid references areas(id) on delete set null,
  name        text not null,
  status      text not null default 'active'
              check (status in ('active','paused','done')),
  finish_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ── карточки ─────────────────────────────────────────────────────
create table if not exists cards (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  type             text not null default 'task'
                   check (type in ('task','research','decision')),
  stage            text not null default 'todo'
                   check (stage in ('todo','doing','waiting','done')),
  horizon          text not null default 'inbox'
                   check (horizon in ('inbox','today','week','someday')),
  state            text not null default 'active'
                   check (state in ('active','postponed','dropped')),

  area_id          uuid references areas(id) on delete set null,
  project_id       uuid references projects(id) on delete set null,
  parent_id        uuid references cards(id) on delete cascade,

  priority         text not null default 'p2'
                   check (priority in ('p0','p1','p2','p3')),
  due_at           timestamptz,
  due_kind         text not null default 'intent'
                   check (due_kind in ('hard','intent')),
  scheduled_at     timestamptz,
  estimate_min     integer,

  -- ресерч
  why              text,
  research_kind    text check (research_kind in ('article','video','book','topic','product','person')),
  research_url     text,
  research_status  text check (research_status in ('new','seen','concluded','applied')),
  verdict          text,
  my_take          text,

  -- избегание
  postpone_count   integer not null default 0,
  last_postponed_at timestamptz,
  completed_at     timestamptz,
  dropped_at       timestamptz,
  dropped_reason   text,

  sort_order       double precision not null default 0,
  search           tsvector generated always as (
                     to_tsvector('russian',
                       coalesce(title,'') || ' ' || coalesce(why,'') || ' ' ||
                       coalesce(verdict,'') || ' ' || coalesce(my_take,''))
                   ) stored,
  embedding        vector(1024),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cards_board_idx on cards (state, horizon, sort_order);
create index if not exists cards_stage_idx on cards (state, stage, sort_order);
create index if not exists cards_area_idx  on cards (area_id);
create index if not exists cards_due_idx   on cards (due_at) where state = 'active';
create index if not exists cards_parent_idx on cards (parent_id);
create index if not exists cards_search_idx on cards using gin (search);
create index if not exists cards_embedding_idx on cards
  using hnsw (embedding vector_cosine_ops) where embedding is not null;

-- ── чек-листы ────────────────────────────────────────────────────
create table if not exists checklists (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references cards(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists checklists_card_idx on checklists (card_id, position);

-- ── заметки: блоки с авторством ──────────────────────────────────
create table if not exists notes (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references cards(id) on delete cascade,
  author        text not null default 'me' check (author in ('me','agent')),
  kind          text not null default 'note'
                check (kind in ('note','research','suggestion','system')),
  body          text not null,
  anchor_note_id uuid references notes(id) on delete set null,
  status        text not null default 'active'
                check (status in ('active','accepted','dismissed')),
  embedding     vector(1024),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notes_card_idx on notes (card_id, created_at);
create index if not exists notes_embedding_idx on notes
  using hnsw (embedding vector_cosine_ops) where embedding is not null;

-- ── вложения и клипы ─────────────────────────────────────────────
create table if not exists attachments (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid references cards(id) on delete cascade,
  note_id       uuid references notes(id) on delete cascade,
  kind          text not null check (kind in ('link','file','image','document')),
  url           text,
  title         text,
  site          text,
  snapshot      text,            -- сохранённый снимок страницы/документа
  mime          text,
  size_bytes    bigint,
  path          text,            -- относительный путь в storage
  created_at    timestamptz not null default now()
);
create index if not exists attachments_card_idx on attachments (card_id);

-- ── журнал событий (append-only) ─────────────────────────────────
create table if not exists events (
  id          bigserial primary key,
  card_id     uuid references cards(id) on delete cascade,
  actor       text not null default 'me' check (actor in ('me','agent','system')),
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists events_card_idx on events (card_id, created_at desc);

-- ── утренние брифы ───────────────────────────────────────────────
create table if not exists briefs (
  id          uuid primary key default gen_random_uuid(),
  day         date not null unique,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

-- ── прогоны агента ───────────────────────────────────────────────
create table if not exists agent_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running'
              check (status in ('running','ok','error')),
  summary     text,
  steps       jsonb not null default '[]'::jsonb,
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0
);

-- ── настройки ────────────────────────────────────────────────────
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

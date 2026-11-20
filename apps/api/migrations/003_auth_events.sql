-- Журнал событий входа: помогает заметить подбор пароля
create table if not exists auth_events (
  id         bigserial primary key,
  user_id    uuid references users(id) on delete set null,
  email      text,
  type       text not null,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists auth_events_created_idx on auth_events (created_at desc);
create index if not exists auth_events_email_idx on auth_events (lower(email));

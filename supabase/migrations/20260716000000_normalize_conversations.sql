begin;

create table if not exists public.visitors (
  id text primary key check (char_length(id) between 8 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id text primary key,
  visitor_id text not null references public.visitors(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  model text,
  created_at timestamptz not null default now(),
  sequence bigint generated always as identity
);

create table if not exists public.visitor_consents (
  id bigint generated always as identity primary key,
  visitor_id text not null references public.visitors(id) on delete cascade,
  purpose text not null check (purpose in ('ai_processing', 'analytics', 'data_sharing')),
  policy_version text not null,
  granted boolean not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.conversation_insights (
  conversation_id text primary key references public.conversations(id) on delete cascade,
  summary text,
  primary_topic text,
  topics text[] not null default '{}',
  sentiment text,
  risk_level text check (risk_level in ('none', 'low', 'medium', 'high')),
  model text,
  analyzed_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  visitor_id text references public.visitors(id) on delete set null,
  conversation_id text references public.conversations(id) on delete set null,
  event_type text not null,
  properties jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index if not exists conversations_visitor_updated_idx
  on public.conversations (visitor_id, updated_at desc);
create index if not exists conversations_updated_idx
  on public.conversations (updated_at desc);
create index if not exists messages_conversation_sequence_idx
  on public.messages (conversation_id, sequence);
create index if not exists messages_created_idx
  on public.messages (created_at desc);
create index if not exists visitor_consents_lookup_idx
  on public.visitor_consents (visitor_id, purpose, occurred_at desc);
create index if not exists conversation_insights_topic_idx
  on public.conversation_insights (primary_topic, analyzed_at desc);
create index if not exists analytics_events_type_time_idx
  on public.analytics_events (event_type, occurred_at desc);

alter table public.visitors enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.visitor_consents enable row level security;
alter table public.conversation_insights enable row level security;
alter table public.analytics_events enable row level security;

revoke all on public.visitors from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.visitor_consents from anon, authenticated;
revoke all on public.conversation_insights from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;

grant select, insert, update, delete on public.visitors to service_role;
grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.visitor_consents to service_role;
grant select, insert, update, delete on public.conversation_insights to service_role;
grant select, insert, update, delete on public.analytics_events to service_role;
grant usage, select on all sequences in schema public to service_role;

with legacy_state as (
  select value::jsonb as state
  from public.app_settings
  where key = 'mindful_session_state_v1'
  limit 1
), legacy_conversations as (
  select conversation
  from legacy_state
  cross join lateral jsonb_array_elements(coalesce(state->'conversations', '[]'::jsonb)) as conversation
)
insert into public.visitors (id, created_at, updated_at)
select
  conversation->>'visitorId',
  coalesce(nullif(conversation->>'createdAt', '')::timestamptz, now()),
  coalesce(nullif(conversation->>'updatedAt', '')::timestamptz, now())
from legacy_conversations
where conversation->>'visitorId' is not null
  and char_length(conversation->>'visitorId') between 8 and 80
on conflict (id) do update
set updated_at = greatest(public.visitors.updated_at, excluded.updated_at);

with legacy_state as (
  select value::jsonb as state
  from public.app_settings
  where key = 'mindful_session_state_v1'
  limit 1
), legacy_conversations as (
  select conversation
  from legacy_state
  cross join lateral jsonb_array_elements(coalesce(state->'conversations', '[]'::jsonb)) as conversation
)
insert into public.conversations (id, visitor_id, created_at, updated_at)
select
  conversation->>'id',
  conversation->>'visitorId',
  coalesce(nullif(conversation->>'createdAt', '')::timestamptz, now()),
  coalesce(nullif(conversation->>'updatedAt', '')::timestamptz, now())
from legacy_conversations
where conversation->>'id' is not null
  and conversation->>'visitorId' is not null
  and char_length(conversation->>'visitorId') between 8 and 80
on conflict (id) do update
set
  visitor_id = excluded.visitor_id,
  updated_at = greatest(public.conversations.updated_at, excluded.updated_at);

with legacy_state as (
  select value::jsonb as state
  from public.app_settings
  where key = 'mindful_session_state_v1'
  limit 1
), legacy_conversations as (
  select conversation
  from legacy_state
  cross join lateral jsonb_array_elements(coalesce(state->'conversations', '[]'::jsonb)) as conversation
), legacy_messages as (
  select conversation, message, ordinal
  from legacy_conversations
  cross join lateral jsonb_array_elements(coalesce(conversation->'messages', '[]'::jsonb))
    with ordinality as message_row(message, ordinal)
)
insert into public.messages (id, conversation_id, role, content, model, created_at)
select
  coalesce(message->>'id', 'legacy-' || md5((conversation->>'id') || ':' || ordinal::text)),
  conversation->>'id',
  message->>'role',
  left(message->>'text', 4000),
  null,
  coalesce(nullif(message->>'createdAt', '')::timestamptz, now())
from legacy_messages
where conversation->>'id' is not null
  and char_length(conversation->>'visitorId') between 8 and 80
  and message->>'role' in ('user', 'assistant')
  and coalesce(message->>'text', '') <> ''
order by conversation->>'id', ordinal
on conflict (id) do nothing;

insert into public.app_settings (key, value, updated_at)
select
  'mindful_session_settings_v1',
  (value::jsonb->'settings')::text,
  now()
from public.app_settings
where key = 'mindful_session_state_v1'
  and value::jsonb ? 'settings'
on conflict (key) do nothing;

commit;
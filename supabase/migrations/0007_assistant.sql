-- ==========================================================================
-- 0007 · Agentic assistant threads + messages — NWE-122
-- ==========================================================================
create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  last_interaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_threads_user_idx
  on public.assistant_threads (user_id, updated_at desc);

alter table public.assistant_threads enable row level security;
create policy "assistant_threads: own" on public.assistant_threads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger assistant_threads_updated_at before update on public.assistant_threads
  for each row execute function public.handle_updated_at();

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  tool_trace jsonb,
  -- A turn that broke mid-loop still persists whatever it produced, so a thread
  -- never keeps a user message with no reply. The app renders these as "couldn't
  -- finish" rather than as normal assistant output.
  failed boolean not null default false,
  proposal_insight_id uuid references public.insights (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_thread_idx
  on public.assistant_messages (thread_id, created_at);
create index if not exists assistant_messages_user_created_idx
  on public.assistant_messages (user_id, created_at desc);

alter table public.assistant_messages enable row level security;
create policy "assistant_messages: own thread" on public.assistant_messages for all
  using (
    auth.uid() = user_id and exists (
      select 1 from public.assistant_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.assistant_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );

alter table public.insights drop constraint if exists insights_kind_check;
alter table public.insights add constraint insights_kind_check
  check (kind in ('weekly', 'council', 'physique', 'training', 'checkin', 'nutrition', 'assistant'));

grant select, insert, update, delete on public.assistant_threads to authenticated, service_role;
grant select, insert, update, delete on public.assistant_messages to authenticated, service_role;

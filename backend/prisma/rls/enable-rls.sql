-- Row-Level Security policies for Dealy (apply ON SUPABASE).
--
--   psql "$DIRECT_DATABASE_URL" -f prisma/rls/enable-rls.sql
--
-- Defense-in-depth: the NestJS API connects with the service role (which BYPASSES
-- RLS) and already enforces ownership in code. These policies protect every row
-- if the Supabase Data API is ever reachable with a user JWT. `auth.uid()` is the
-- Supabase auth user (= users.supabase_user_id); app rows key on the internal
-- users.id, so we resolve it once via a helper.

create or replace function public.current_app_user_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.users where supabase_user_id = auth.uid()
$$;

-- ---- users: only your own row -------------------------------------------------
alter table public.users enable row level security;
create policy users_self on public.users
  using (supabase_user_id = auth.uid())
  with check (supabase_user_id = auth.uid());

-- ---- user-owned tables: user_id must be the caller ----------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','user_preferences','user_category_preferences',
    'saved_deals','watched_deals','deal_swipes','deal_redemptions','deal_interactions',
    'notifications','notification_preferences','push_tokens','subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy %1$s_owner on public.%1$I using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());',
      t);
  end loop;
end $$;

-- ---- internal/admin tables: deny ALL to user JWTs (service role bypasses) ------
do $$
declare t text;
begin
  foreach t in array array[
    'user_roles','subscription_events','audit_logs','idempotency_keys',
    'price_history','ingestion_runs','ingestion_failures','health_checks'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    -- No policy → RLS denies every row to non-bypassing roles.
  end loop;
end $$;

-- ---- public catalog: read-only to everyone ------------------------------------
alter table public.deals enable row level security;
create policy deals_public_read on public.deals for select using (status = 'published');

do $$
declare t text;
begin
  foreach t in array array['categories','schools','campuses','stores'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %1$s_public_read on public.%1$I for select using (true);', t);
  end loop;
end $$;

-- rls_auto_enable() backs the `ensure_rls` event trigger (ddl_command_end),
-- which turns on row level security for every new table in `public`. It was
-- not created by our migrations (it comes from the Supabase dashboard's
-- automatic-RLS setting) and we keep it: it is a good safety net.
--
-- It is SECURITY DEFINER and kept Postgres' default EXECUTE grant, so the
-- advisor lists it as /rest/v1/rpc/rls_auto_enable for anon + authenticated.
-- An event-trigger function cannot run outside an event trigger, so this was
-- not exploitable; revoke it anyway. The event trigger keeps firing: EXECUTE
-- is checked when a trigger is created, not each time it fires.
--
-- Guarded so a fresh project without the dashboard setting still migrates.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

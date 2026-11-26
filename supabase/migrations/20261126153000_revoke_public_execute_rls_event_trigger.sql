-- rls_auto_enable is an event-trigger function. PostgreSQL invokes it through
-- the registered event trigger; browser/API roles do not need direct EXECUTE.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

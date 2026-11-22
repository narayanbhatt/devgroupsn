-- Security hardening from the Supabase advisor.
-- 1. Trigger functions are never meant to be called through the API. Triggers fire
--    whatever the caller's EXECUTE rights, so removing them is safe.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_org_owner() from public, anon, authenticated;
revoke execute on function public.audit_product_change() from public, anon, authenticated;
revoke execute on function public.audit_staff_role_change() from public, anon, authenticated;
revoke execute on function public.guard_profile_status() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 2. Pin the search path of the one function that lacked it.
alter function public.set_updated_at() set search_path = '';

-- 3. Organization helpers are only used by signed-in users' policies.
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;

-- is_staff() and has_role() stay callable by anon and authenticated on purpose:
-- catalogue policies for visitors use them, and they only describe the caller.

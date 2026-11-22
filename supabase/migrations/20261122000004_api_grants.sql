-- Explicit API grants. Newer Supabase projects do not grant tables to the API roles
-- automatically, so each table states exactly what visitors and signed-in users may
-- attempt. Row-level security then decides which rows they reach.

-- Visitors (not signed in): read the published catalogue only.
grant select on public.categories, public.products, public.product_images to anon;

-- Signed-in users
grant select, insert, update, delete on
  public.organizations,
  public.organization_members,
  public.addresses,
  public.categories,
  public.products,
  public.product_images,
  public.app_config
to authenticated;

grant select, insert, delete on public.staff_roles to authenticated;
grant select on public.profiles, public.audit_logs to authenticated;
-- profiles: update stays limited to the columns granted in the foundation migration.

-- Policy helpers
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.has_role(public.staff_role) to anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- Phase 0 foundation: identity, staff roles, organizations, catalogue, config, audit.
-- Every table has row-level security enabled. Authorization never relies on the app.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.customer_type as enum ('individual', 'business', 'government', 'institution', 'contractor');
create type public.account_status as enum ('active', 'disabled');
create type public.staff_role as enum (
  'super_admin', 'catalog_admin', 'order_manager', 'project_manager', 'finance', 'support_agent'
);
create type public.org_type as enum ('business', 'government', 'institution', 'other');
create type public.org_member_role as enum ('owner', 'admin', 'approver', 'member', 'viewer');
create type public.product_status as enum ('draft', 'published', 'archived', 'temporarily_unavailable');
create type public.pricing_type as enum ('fixed', 'starting_from', 'quote');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  customer_type public.customer_type not null default 'individual',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up (email or Google).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Staff roles (server-side source of truth for staff access)
-- ---------------------------------------------------------------------------
create table public.staff_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- security definer so policies can call these without recursive RLS checks.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles s
    join public.profiles p on p.id = s.user_id
    where s.user_id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.has_role(r public.staff_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles s
    join public.profiles p on p.id = s.user_id
    where s.user_id = auth.uid() and p.status = 'active'
      and (s.role = r or s.role = 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type public.org_type not null default 'business',
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  department text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_member_role not null default 'member',
  designation text,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- The creator of an organization becomes its owner.
create or replace function public.add_org_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger organizations_add_owner after insert on public.organizations
  for each row execute function public.add_org_owner();

-- ---------------------------------------------------------------------------
-- Addresses (belong to a user or to an organization)
-- ---------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  kind text not null default 'delivery' check (kind in ('billing', 'delivery', 'site')),
  label text,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is null) <> (organization_id is null))
);
create index addresses_user_idx on public.addresses (user_id);
create index addresses_org_idx on public.addresses (organization_id);
create trigger addresses_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid not null references public.categories (id),
  description text,
  -- Listed price is a display default only; final prices come from quotations.
  listed_price numeric(12, 2) check (listed_price is null or listed_price >= 0),
  pricing_type public.pricing_type not null default 'fixed',
  tax_rate numeric(5, 2) not null default 18 check (tax_rate between 0 and 100),
  tax_note text,
  unit text not null default 'piece',
  status public.product_status not null default 'draft',
  specifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_status_idx on public.products (status);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  alt text,
  sort_order int not null default 0
);
create index product_images_product_idx on public.product_images (product_id);

-- ---------------------------------------------------------------------------
-- App configuration (quotation defaults etc.)
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log (written only by server-side triggers/functions)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at);

create or replace function public.audit_product_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (action, entity_type, entity_id, after)
    values ('PRODUCT_CREATED', 'product', new.id, to_jsonb(new));
  elsif new.listed_price is distinct from old.listed_price then
    insert into public.audit_logs (action, entity_type, entity_id, before, after)
    values ('PRICE_CHANGED', 'product', new.id,
            jsonb_build_object('listed_price', old.listed_price),
            jsonb_build_object('listed_price', new.listed_price));
  elsif new.status is distinct from old.status and new.status = 'published' then
    insert into public.audit_logs (action, entity_type, entity_id, before, after)
    values ('PRODUCT_PUBLISHED', 'product', new.id,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  else
    insert into public.audit_logs (action, entity_type, entity_id, before, after)
    values ('PRODUCT_UPDATED', 'product', new.id, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;
create trigger products_audit after insert or update on public.products
  for each row execute function public.audit_product_change();

create or replace function public.audit_staff_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (action, entity_type, entity_id, before, after)
  values ('ADMIN_ROLE_CHANGED', 'profile', coalesce(new.user_id, old.user_id),
          case when tg_op = 'DELETE' then jsonb_build_object('removed', old.role) end,
          case when tg_op = 'INSERT' then jsonb_build_object('added', new.role) end);
  return coalesce(new, old);
end $$;
create trigger staff_roles_audit after insert or delete on public.staff_roles
  for each row execute function public.audit_staff_role_change();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.app_config enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users see and edit their own; staff see all; only super admin changes status.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));
-- Customers may only edit these columns of their own profile.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, customer_type) on public.profiles to authenticated;
grant update (status) on public.profiles to authenticated; -- gated by profiles_update_admin + trigger below

create or replace function public.guard_profile_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and not public.has_role('super_admin') then
    raise exception 'Only a super admin can change account status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_status before update on public.profiles
  for each row execute function public.guard_profile_status();

-- Staff roles: a user can see their own roles; super admin manages all.
create policy staff_roles_select on public.staff_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('super_admin'));
create policy staff_roles_write on public.staff_roles for all to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- Organizations
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_staff());
create policy organizations_insert on public.organizations for insert to authenticated
  with check (created_by = auth.uid());
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_admin(id) or public.has_role('super_admin'))
  with check (public.is_org_admin(id) or public.has_role('super_admin'));

-- Organization members
create policy org_members_select on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id) or public.is_staff());
create policy org_members_write on public.organization_members for all to authenticated
  using (public.is_org_admin(organization_id) or public.has_role('super_admin'))
  with check (public.is_org_admin(organization_id) or public.has_role('super_admin'));

-- Addresses
create policy addresses_select on public.addresses for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_staff());
create policy addresses_write on public.addresses for all to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id))
  with check (user_id = auth.uid() or public.is_org_admin(organization_id));

-- Catalogue: anyone may read what is published; only catalogue admins change it.
create policy categories_select on public.categories for select to anon, authenticated
  using (is_active or public.has_role('catalog_admin'));
create policy categories_write on public.categories for all to authenticated
  using (public.has_role('catalog_admin')) with check (public.has_role('catalog_admin'));

create policy products_select on public.products for select to anon, authenticated
  using (status in ('published', 'temporarily_unavailable') or public.is_staff());
create policy products_write on public.products for all to authenticated
  using (public.has_role('catalog_admin')) with check (public.has_role('catalog_admin'));

create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (
    select 1 from public.products p where p.id = product_id
      and (p.status in ('published', 'temporarily_unavailable') or public.is_staff())
  ));
create policy product_images_write on public.product_images for all to authenticated
  using (public.has_role('catalog_admin')) with check (public.has_role('catalog_admin'));

-- Config: readable by signed-in users; super admin writes.
create policy app_config_select on public.app_config for select to authenticated using (true);
create policy app_config_write on public.app_config for all to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- Audit log: super admin reads; nobody writes directly (triggers are security definer).
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_role('super_admin'));

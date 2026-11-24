-- Phase 3: enquiries and quotations (design doc §13-17, §38-39, §47, §66, §68).
--
-- How it works
-- * The enquiry basket lives on the phone. Submitting it calls submit_enquiry(), which
--   creates the enquiry and its items in one step, numbers it (ENQ-2026-0001) and
--   copies each product's name, SKU and listed price as they are at that moment.
-- * Staff with the order_manager role build quotations: a draft they can edit freely,
--   then send_quotation() freezes it. Changing a sent quotation means a new version
--   (create_quotation_revision), so a version a customer has seen is never rewritten.
-- * Customers answer through answer_quotation() (approve, ask for a revision, or decline).
--   Every step is written to commercial_events.

create type public.enquiry_status as enum (
  'submitted', 'under_review', 'requirement_clarification', 'quote_preparation', 'quoted',
  'revision_requested', 'approved', 'converted_to_order', 'rejected', 'cancelled', 'expired'
);
create type public.quotation_status as enum (
  'draft', 'sent', 'viewed', 'revision_requested', 'approved', 'rejected', 'expired',
  'cancelled', 'superseded', 'converted'
);

-- ---------------------------------------------------------------------------
-- Document numbers: ENQ-2026-0001, Q-2026-0001. One counter per kind per year.
-- ---------------------------------------------------------------------------
create table public.document_counters (
  kind text not null,
  year int not null,
  last_value int not null default 0,
  primary key (kind, year)
);
alter table public.document_counters enable row level security;
-- No policies and no grants: only the security-definer function below touches it.

create or replace function public.next_document_number(prefix text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  y int := extract(year from (now() at time zone 'Asia/Kolkata'))::int;
  n int;
begin
  insert into public.document_counters (kind, year, last_value) values (prefix, y, 1)
  on conflict (kind, year) do update set last_value = public.document_counters.last_value + 1
  returning last_value into n;
  return prefix || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;
revoke execute on function public.next_document_number(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enquiries
-- ---------------------------------------------------------------------------
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  enquiry_number text not null unique,
  customer_id uuid not null references public.profiles (id),
  organization_id uuid references public.organizations (id),
  status public.enquiry_status not null default 'submitted',
  project_name text,
  contact_person text not null,
  phone text not null,
  email text,
  project_location text,
  delivery_address_id uuid references public.addresses (id) on delete set null,
  required_by date,
  requirements text,
  notes text,
  -- Government and business procurement (§14.3)
  department text,
  designation text,
  procurement_reference text,
  po_required boolean not null default false,
  assigned_to uuid references public.profiles (id),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enquiries_customer_idx on public.enquiries (customer_id);
create index enquiries_org_idx on public.enquiries (organization_id);
create index enquiries_status_idx on public.enquiries (status);
create trigger enquiries_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();

create table public.enquiry_items (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- Snapshot of the product when the enquiry was sent; later catalogue edits don't change it.
  product_name text not null,
  sku text,
  unit text not null default 'piece',
  listed_price numeric(12, 2),
  quantity numeric(12, 2) not null check (quantity > 0),
  installation_required boolean not null default false,
  notes text,
  sort_order int not null default 0
);
create index enquiry_items_enquiry_idx on public.enquiry_items (enquiry_id);

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null,
  version int not null default 1 check (version > 0),
  enquiry_id uuid not null references public.enquiries (id),
  customer_id uuid not null references public.profiles (id),
  organization_id uuid references public.organizations (id),
  status public.quotation_status not null default 'draft',
  valid_until date,
  currency text not null default 'INR' check (currency = 'INR'),
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  delivery numeric(14, 2) not null default 0 check (delivery >= 0),
  installation numeric(14, 2) not null default 0 check (installation >= 0),
  other_charges numeric(14, 2) not null default 0 check (other_charges >= 0),
  grand_total numeric(14, 2) not null default 0,
  terms text,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  responded_by uuid references public.profiles (id),
  response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_number, version)
);
create index quotations_enquiry_idx on public.quotations (enquiry_id);
create index quotations_customer_idx on public.quotations (customer_id);
create trigger quotations_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  sku text,
  unit text not null default 'piece',
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 18 check (tax_rate between 0 and 100),
  line_total numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  line_tax numeric(14, 2) generated always as (round(quantity * unit_price * tax_rate / 100, 2)) stored,
  sort_order int not null default 0
);
create index quotation_items_quotation_idx on public.quotation_items (quotation_id);

create table public.commercial_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  quotation_id uuid references public.quotations (id) on delete cascade,
  event text not null,
  actor_id uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index commercial_events_enquiry_idx on public.commercial_events (enquiry_id, created_at);

-- ---------------------------------------------------------------------------
-- Totals: GST is charged per line; delivery, installation and other charges are
-- added as entered (inclusive of any tax on them), and the discount is taken off.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_quotation(q uuid)
returns void language sql security definer set search_path = '' as $$
  update public.quotations t set
    subtotal = s.subtotal,
    tax = s.tax,
    grand_total = greatest(0, s.subtotal + s.tax + t.delivery + t.installation + t.other_charges - t.discount)
  from (
    select coalesce(sum(line_total), 0) as subtotal, coalesce(sum(line_tax), 0) as tax
    from public.quotation_items where quotation_id = q
  ) s
  where t.id = q;
$$;
revoke execute on function public.recalc_quotation(uuid) from public, anon, authenticated;

create or replace function public.quotation_items_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalc_quotation(coalesce(new.quotation_id, old.quotation_id));
  return null;
end $$;
create trigger quotation_items_totals after insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_changed();

create or replace function public.quotation_charges_changed()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.grand_total := greatest(0, new.subtotal + new.tax + new.delivery + new.installation
    + new.other_charges - new.discount);
  return new;
end $$;
create trigger quotations_totals before insert or update on public.quotations
  for each row execute function public.quotation_charges_changed();

-- ---------------------------------------------------------------------------
-- Pricing integrity (§47): only drafts can be edited. Status changes after that
-- happen only inside the functions below, which set a transaction-local flag.
-- ---------------------------------------------------------------------------
create or replace function public.guard_quotation_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('devgroup.workflow', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only a draft quotation can be deleted.' using errcode = '42501'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    raise exception 'This quotation has been sent and can''t be edited. Create a revision instead.' using errcode = '42501';
  end if;
  if new.status <> 'draft' then
    raise exception 'Use Send to send a quotation.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger quotations_guard before insert or update or delete on public.quotations
  for each row execute function public.guard_quotation_change();

create or replace function public.guard_quotation_item_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.quotation_status;
begin
  if current_setting('devgroup.workflow', true) = 'on' then
    return coalesce(new, old);
  end if;
  select status into st from public.quotations where id = coalesce(new.quotation_id, old.quotation_id);
  -- No row: the quotation itself is being deleted (a draft, checked by its own guard).
  if st is not null and st <> 'draft' then
    raise exception 'This quotation has been sent and can''t be edited. Create a revision instead.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger quotation_items_guard before insert or update or delete on public.quotation_items
  for each row execute function public.guard_quotation_item_change();
revoke execute on function public.quotation_items_changed() from public, anon, authenticated;
revoke execute on function public.guard_quotation_item_change() from public, anon, authenticated;

-- Customers may only see their own enquiry, or one for an organization they belong to.
create or replace function public.can_see_enquiry(e uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enquiries x
    where x.id = e and (
      x.customer_id = auth.uid()
      or (x.organization_id is not null and public.is_org_member(x.organization_id))
      or public.is_staff()
    )
  );
$$;

-- Who may accept or decline a quotation for the customer (§66).
create or replace function public.can_answer_quotation(q public.quotations)
returns boolean language sql stable security definer set search_path = '' as $$
  select q.customer_id = auth.uid()
    or (q.organization_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = q.organization_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'approver')
    ));
$$;

create or replace function public.log_commercial_event(e uuid, q uuid, ev text, note text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.commercial_events (enquiry_id, quotation_id, event, actor_id, note)
  values (e, q, ev, auth.uid(), nullif(trim(note), ''));
$$;
revoke execute on function public.log_commercial_event(uuid, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer: submit an enquiry from the basket.
-- details: { project_name, contact_person, phone, email, project_location, required_by,
--            requirements, notes, organization_id, delivery_address_id, department,
--            designation, procurement_reference, po_required }
-- items:   [ { product_id, quantity, installation_required, notes } ]
-- ---------------------------------------------------------------------------
create or replace function public.submit_enquiry(details jsonb, items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  org uuid := nullif(details ->> 'organization_id', '')::uuid;
  addr uuid := nullif(details ->> 'delivery_address_id', '')::uuid;
  e uuid;
  it jsonb;
  p public.products;
  i int := 0;
begin
  if me is null then raise exception 'Sign in to send an enquiry.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'This account is disabled.' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Add at least one product to the enquiry.' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 100 then
    raise exception 'An enquiry can have up to 100 products.' using errcode = '22023';
  end if;
  if coalesce(trim(details ->> 'contact_person'), '') = '' or coalesce(trim(details ->> 'phone'), '') = '' then
    raise exception 'Enter a contact name and phone number.' using errcode = '22023';
  end if;
  if org is not null and not public.is_org_member(org) then
    raise exception 'You are not a member of that organization.' using errcode = '42501';
  end if;
  if addr is not null and not exists (
    select 1 from public.addresses a
    where a.id = addr and (a.user_id = me or (a.organization_id is not null and public.is_org_member(a.organization_id)))
  ) then
    raise exception 'Choose one of your saved addresses.' using errcode = '42501';
  end if;

  insert into public.enquiries (
    enquiry_number, customer_id, organization_id, project_name, contact_person, phone, email,
    project_location, delivery_address_id, required_by, requirements, notes,
    department, designation, procurement_reference, po_required
  ) values (
    public.next_document_number('ENQ'), me, org,
    nullif(trim(details ->> 'project_name'), ''),
    trim(details ->> 'contact_person'),
    trim(details ->> 'phone'),
    nullif(trim(details ->> 'email'), ''),
    nullif(trim(details ->> 'project_location'), ''),
    addr,
    nullif(details ->> 'required_by', '')::date,
    nullif(trim(details ->> 'requirements'), ''),
    nullif(trim(details ->> 'notes'), ''),
    nullif(trim(details ->> 'department'), ''),
    nullif(trim(details ->> 'designation'), ''),
    nullif(trim(details ->> 'procurement_reference'), ''),
    coalesce((details ->> 'po_required')::boolean, false)
  ) returning id into e;

  for it in select * from jsonb_array_elements(items) loop
    select * into p from public.products
    where id = (it ->> 'product_id')::uuid and status = 'published';
    if not found then
      raise exception 'A product in your enquiry is no longer available. Remove it and try again.' using errcode = '22023';
    end if;
    if coalesce((it ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'Enter a quantity for %.', p.name using errcode = '22023';
    end if;
    insert into public.enquiry_items (
      enquiry_id, product_id, product_name, sku, unit, listed_price, quantity,
      installation_required, notes, sort_order
    ) values (
      e, p.id, p.name, p.sku, p.unit,
      case when p.pricing_type = 'quote' then null else p.listed_price end,
      (it ->> 'quantity')::numeric,
      coalesce((it ->> 'installation_required')::boolean, false),
      nullif(trim(it ->> 'notes'), ''),
      i
    );
    i := i + 1;
  end loop;

  perform public.log_commercial_event(e, null, 'ENQUIRY_SUBMITTED');
  return e;
end $$;

create or replace function public.cancel_enquiry(e uuid, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.enquiries;
begin
  select * into x from public.enquiries where id = e for update;
  if not found or x.customer_id <> auth.uid() then
    raise exception 'Enquiry not found.' using errcode = '42501';
  end if;
  if x.status in ('approved', 'converted_to_order', 'rejected', 'cancelled') then
    raise exception 'This enquiry can no longer be cancelled.' using errcode = '22023';
  end if;
  perform set_config('devgroup.workflow', 'on', true);
  update public.enquiries set status = 'cancelled' where id = e;
  update public.quotations set status = 'cancelled'
    where enquiry_id = e and status in ('draft', 'sent', 'viewed', 'revision_requested');
  perform set_config('devgroup.workflow', 'off', true);
  perform public.log_commercial_event(e, null, 'ENQUIRY_CANCELLED', reason);
end $$;

-- ---------------------------------------------------------------------------
-- Staff: enquiry status, quotation drafting and sending.
-- ---------------------------------------------------------------------------
create or replace function public.set_enquiry_status(e uuid, new_status public.enquiry_status, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.enquiries;
begin
  if not public.has_role('order_manager') then
    raise exception 'Only order managers can change an enquiry.' using errcode = '42501';
  end if;
  if new_status not in ('under_review', 'requirement_clarification', 'quote_preparation', 'rejected') then
    raise exception 'That status is set automatically.' using errcode = '22023';
  end if;
  select * into x from public.enquiries where id = e for update;
  if not found then raise exception 'Enquiry not found.' using errcode = '22023'; end if;
  if x.status in ('approved', 'converted_to_order', 'cancelled', 'rejected') then
    raise exception 'This enquiry is closed.' using errcode = '22023';
  end if;
  update public.enquiries set status = new_status, assigned_to = coalesce(assigned_to, auth.uid()) where id = e;
  perform public.log_commercial_event(e, null, 'ENQUIRY_' || upper(new_status::text), note);
end $$;

-- Starts a draft quotation from the enquiry's items at their listed prices.
create or replace function public.create_quotation(e uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  x public.enquiries;
  q uuid;
  defaults jsonb;
begin
  if not public.has_role('order_manager') then
    raise exception 'Only order managers can prepare quotations.' using errcode = '42501';
  end if;
  select * into x from public.enquiries where id = e for update;
  if not found then raise exception 'Enquiry not found.' using errcode = '22023'; end if;
  if x.status in ('approved', 'converted_to_order', 'cancelled', 'rejected') then
    raise exception 'This enquiry is closed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotations where enquiry_id = e and status = 'draft') then
    raise exception 'This enquiry already has a draft quotation.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotations where enquiry_id = e) then
    raise exception 'This enquiry already has a quotation. Create a revision of it instead.' using errcode = '22023';
  end if;
  select value into defaults from public.app_config where key = 'quotation_defaults';

  insert into public.quotations (quotation_number, enquiry_id, customer_id, organization_id, terms, valid_until)
  values (
    public.next_document_number('Q'), e, x.customer_id, x.organization_id,
    defaults ->> 'terms',
    (now() at time zone 'Asia/Kolkata')::date + coalesce((defaults ->> 'validity_days')::int, 30)
  ) returning id into q;

  insert into public.quotation_items (quotation_id, product_id, description, sku, unit, quantity, unit_price, tax_rate, sort_order)
  select q, i.product_id, i.product_name, i.sku, i.unit, i.quantity, coalesce(i.listed_price, 0),
    coalesce(p.tax_rate, (defaults ->> 'gst_rate')::numeric, 18), i.sort_order
  from public.enquiry_items i
  left join public.products p on p.id = i.product_id
  where i.enquiry_id = e;

  update public.enquiries set status = 'quote_preparation', assigned_to = coalesce(assigned_to, auth.uid())
    where id = e and status <> 'quote_preparation';
  perform public.log_commercial_event(e, q, 'QUOTATION_CREATED');
  return q;
end $$;

-- Copies a sent quotation into a new draft version.
create or replace function public.create_quotation_revision(q uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old public.quotations;
  nq uuid;
  defaults jsonb;
begin
  if not public.has_role('order_manager') then
    raise exception 'Only order managers can prepare quotations.' using errcode = '42501';
  end if;
  select * into old from public.quotations where id = q for update;
  if not found then raise exception 'Quotation not found.' using errcode = '22023'; end if;
  if old.status in ('draft', 'approved', 'converted', 'cancelled', 'superseded') then
    raise exception 'This quotation can''t be revised.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotations where quotation_number = old.quotation_number and version > old.version) then
    raise exception 'A newer version already exists.' using errcode = '22023';
  end if;
  if exists (select 1 from public.enquiries where id = old.enquiry_id and status in ('cancelled', 'converted_to_order')) then
    raise exception 'This enquiry is closed.' using errcode = '22023';
  end if;
  select value into defaults from public.app_config where key = 'quotation_defaults';

  insert into public.quotations (
    quotation_number, version, enquiry_id, customer_id, organization_id, valid_until,
    discount, delivery, installation, other_charges, terms, notes
  ) values (
    old.quotation_number, old.version + 1, old.enquiry_id, old.customer_id, old.organization_id,
    (now() at time zone 'Asia/Kolkata')::date + coalesce((defaults ->> 'validity_days')::int, 30),
    old.discount, old.delivery, old.installation, old.other_charges, old.terms, old.notes
  ) returning id into nq;

  insert into public.quotation_items (quotation_id, product_id, description, sku, unit, quantity, unit_price, tax_rate, sort_order)
  select nq, product_id, description, sku, unit, quantity, unit_price, tax_rate, sort_order
  from public.quotation_items where quotation_id = q;

  update public.enquiries set status = 'quote_preparation' where id = old.enquiry_id;
  perform public.log_commercial_event(old.enquiry_id, nq, 'VERSION_CREATED', 'v' || (old.version + 1));
  return nq;
end $$;

create or replace function public.send_quotation(q uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.quotations;
begin
  if not public.has_role('order_manager') then
    raise exception 'Only order managers can send quotations.' using errcode = '42501';
  end if;
  select * into x from public.quotations where id = q for update;
  if not found then raise exception 'Quotation not found.' using errcode = '22023'; end if;
  if x.status <> 'draft' then raise exception 'This quotation has already been sent.' using errcode = '22023'; end if;
  if not exists (select 1 from public.quotation_items where quotation_id = q) then
    raise exception 'A quotation needs at least one item.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotation_items where quotation_id = q and unit_price = 0) then
    raise exception 'Every item needs a price before the quotation is sent.' using errcode = '22023';
  end if;
  if x.valid_until is null or x.valid_until < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Set a valid-until date that is today or later.' using errcode = '22023';
  end if;

  perform set_config('devgroup.workflow', 'on', true);
  -- Earlier versions the customer could still answer are replaced by this one.
  update public.quotations set status = 'superseded'
    where quotation_number = x.quotation_number and version < x.version
      and status in ('sent', 'viewed', 'revision_requested', 'rejected', 'expired');
  update public.quotations set status = 'sent', sent_at = now() where id = q;
  perform set_config('devgroup.workflow', 'off', true);
  update public.enquiries set status = 'quoted' where id = x.enquiry_id;
  perform public.log_commercial_event(x.enquiry_id, q, 'SENT', x.quotation_number || ' v' || x.version);
end $$;

-- ---------------------------------------------------------------------------
-- Customer: open, approve, ask for changes, decline.
-- ---------------------------------------------------------------------------
create or replace function public.mark_quotation_viewed(q uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.quotations;
begin
  select * into x from public.quotations where id = q;
  if not found or not public.can_see_enquiry(x.enquiry_id) or public.is_staff() and x.customer_id <> auth.uid() then
    return;  -- staff opening it don't count as the customer viewing it
  end if;
  if x.status = 'sent' then
    perform set_config('devgroup.workflow', 'on', true);
    update public.quotations set status = 'viewed', viewed_at = now() where id = q;
    perform set_config('devgroup.workflow', 'off', true);
    perform public.log_commercial_event(x.enquiry_id, q, 'VIEWED');
  end if;
end $$;

-- Returns the quotation's new status. An expired quotation is marked expired (and the
-- answer refused) without raising, so that the change sticks.
create or replace function public.answer_quotation(q uuid, answer text, note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  x public.quotations;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if answer not in ('approve', 'revise', 'reject') then
    raise exception 'Unknown answer.' using errcode = '22023';
  end if;
  select * into x from public.quotations where id = q for update;
  if not found or not public.can_answer_quotation(x) then
    raise exception 'Only the customer, or an organization admin or approver, can answer this quotation.' using errcode = '42501';
  end if;
  if x.status not in ('sent', 'viewed') then
    raise exception 'This quotation has already been answered or replaced.' using errcode = '22023';
  end if;
  if x.valid_until < today then
    perform set_config('devgroup.workflow', 'on', true);
    update public.quotations set status = 'expired' where id = q;
    perform set_config('devgroup.workflow', 'off', true);
    update public.enquiries set status = 'expired' where id = x.enquiry_id and status = 'quoted';
    perform public.log_commercial_event(x.enquiry_id, q, 'EXPIRED');
    return 'expired';
  end if;
  if answer in ('revise', 'reject') and coalesce(trim(note), '') = '' then
    raise exception 'Tell us what to change, or why you are declining.' using errcode = '22023';
  end if;

  perform set_config('devgroup.workflow', 'on', true);
  update public.quotations set
    status = case answer when 'approve' then 'approved' when 'revise' then 'revision_requested' else 'rejected' end::public.quotation_status,
    responded_at = now(), responded_by = auth.uid(), response_note = nullif(trim(note), ''),
    viewed_at = coalesce(viewed_at, now())
  where id = q;
  perform set_config('devgroup.workflow', 'off', true);
  update public.enquiries set status =
    case answer when 'approve' then 'approved' when 'revise' then 'revision_requested' else 'rejected' end::public.enquiry_status
  where id = x.enquiry_id;
  perform public.log_commercial_event(x.enquiry_id, q,
    case answer when 'approve' then 'APPROVED' when 'revise' then 'REVISION_REQUESTED' else 'REJECTED' end, note);
  return case answer when 'approve' then 'approved' when 'revise' then 'revision_requested' else 'rejected' end;
end $$;

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
alter table public.enquiries enable row level security;
alter table public.enquiry_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.commercial_events enable row level security;

create policy enquiries_select on public.enquiries for select to authenticated
  using (customer_id = auth.uid() or (organization_id is not null and public.is_org_member(organization_id)) or public.is_staff());
create policy enquiry_items_select on public.enquiry_items for select to authenticated
  using (public.can_see_enquiry(enquiry_id));

-- Customers never see drafts; staff see everything.
create policy quotations_select on public.quotations for select to authenticated
  using (public.is_staff() or (status <> 'draft' and public.can_see_enquiry(enquiry_id)));
create policy quotations_staff_write on public.quotations for update to authenticated
  using (public.has_role('order_manager')) with check (public.has_role('order_manager'));
create policy quotations_staff_delete on public.quotations for delete to authenticated
  using (public.has_role('order_manager'));

create policy quotation_items_select on public.quotation_items for select to authenticated
  using (exists (
    select 1 from public.quotations q where q.id = quotation_id
      and (public.is_staff() or (q.status <> 'draft' and public.can_see_enquiry(q.enquiry_id)))
  ));
create policy quotation_items_staff_write on public.quotation_items for all to authenticated
  using (public.has_role('order_manager')) with check (public.has_role('order_manager'));

create policy commercial_events_select on public.commercial_events for select to authenticated
  using (public.can_see_enquiry(enquiry_id));

-- Table rights. Customers change nothing directly: everything goes through the functions.
grant select on public.enquiries, public.enquiry_items, public.quotations, public.quotation_items,
  public.commercial_events to authenticated;
-- Staff edit drafts directly (columns that aren't totals, numbers or workflow state).
grant update (valid_until, discount, delivery, installation, other_charges, terms, notes)
  on public.quotations to authenticated;
grant delete on public.quotations to authenticated;
grant insert, update, delete on public.quotation_items to authenticated;

revoke execute on function public.submit_enquiry(jsonb, jsonb) from public, anon;
revoke execute on function public.cancel_enquiry(uuid, text) from public, anon;
revoke execute on function public.set_enquiry_status(uuid, public.enquiry_status, text) from public, anon;
revoke execute on function public.create_quotation(uuid) from public, anon;
revoke execute on function public.create_quotation_revision(uuid) from public, anon;
revoke execute on function public.send_quotation(uuid) from public, anon;
revoke execute on function public.mark_quotation_viewed(uuid) from public, anon;
revoke execute on function public.answer_quotation(uuid, text, text) from public, anon;
revoke execute on function public.can_see_enquiry(uuid) from public, anon;
revoke execute on function public.can_answer_quotation(public.quotations) from public, anon;
grant execute on function public.submit_enquiry(jsonb, jsonb), public.cancel_enquiry(uuid, text),
  public.set_enquiry_status(uuid, public.enquiry_status, text), public.create_quotation(uuid),
  public.create_quotation_revision(uuid), public.send_quotation(uuid), public.mark_quotation_viewed(uuid),
  public.answer_quotation(uuid, text, text), public.can_see_enquiry(uuid),
  public.can_answer_quotation(public.quotations)
  to authenticated;
revoke execute on function public.guard_quotation_change() from public, anon, authenticated;
revoke execute on function public.quotation_charges_changed() from public, anon, authenticated;

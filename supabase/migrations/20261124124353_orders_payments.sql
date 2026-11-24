-- Phase 4: orders, payments and documents (design doc §18-24, §29-30, §40-41, §53, §66-67, §72).
--
-- How it works
-- * An order manager turns an approved quotation into an order with create_order(). The order
--   keeps its own copy of the quotation's lines and totals, so later price changes never touch it.
-- * The order moves through fixed stages with set_order_status(); every move is an order event,
--   which is what the customer's timeline shows.
-- * There is no payment gateway (§19, §81). The customer records a bank transfer, UPI payment
--   or cheque with submit_payment() and attaches proof. Finance verifies or rejects it with
--   review_payment(), and the order's paid amount and payment status follow from that.
-- * Files (payment proofs, purchase orders, invoices, delivery papers, enquiry attachments) go in
--   the private "documents" bucket under <owner type>/<owner id>/..., and are registered with
--   add_document(). Customers only ever read files on their own enquiries and orders.

create type public.order_status as enum (
  'payment_pending', 'confirmed', 'processing', 'in_progress', 'ready_for_dispatch',
  'out_for_delivery', 'completed', 'cancelled', 'disputed'
);
create type public.order_payment_status as enum ('unpaid', 'under_review', 'partially_paid', 'paid', 'rejected');
create type public.payment_method as enum ('bank_transfer', 'upi', 'cheque', 'cash', 'other');
create type public.payment_state as enum ('submitted', 'verified', 'rejected');
create type public.document_type as enum (
  'GST_CERTIFICATE', 'PAN', 'QUOTATION_PDF', 'PURCHASE_ORDER', 'INVOICE', 'PAYMENT_PROOF',
  'DELIVERY_DOCUMENT', 'PROJECT_DOCUMENT', 'OTHER'
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  enquiry_id uuid not null references public.enquiries (id),
  quotation_id uuid not null unique references public.quotations (id),
  customer_id uuid not null references public.profiles (id),
  organization_id uuid references public.organizations (id),
  status public.order_status not null default 'payment_pending',
  payment_status public.order_payment_status not null default 'unpaid',
  currency text not null default 'INR' check (currency = 'INR'),
  -- Commercial snapshot of the approved quotation (§18).
  subtotal numeric(14, 2) not null,
  tax numeric(14, 2) not null,
  discount numeric(14, 2) not null,
  delivery numeric(14, 2) not null,
  installation numeric(14, 2) not null,
  other_charges numeric(14, 2) not null,
  grand_total numeric(14, 2) not null,
  terms text,
  project_name text,
  project_location text,
  delivery_address text,
  paid_amount numeric(14, 2) not null default 0,
  expected_delivery date,
  assigned_manager_id uuid references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_org_idx on public.orders (organization_id);
create index orders_status_idx on public.orders (status);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  sku text,
  unit text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  tax_rate numeric(5, 2) not null,
  line_total numeric(14, 2) not null,
  line_tax numeric(14, 2) not null,
  sort_order int not null default 0
);
create index order_items_order_idx on public.order_items (order_id);

-- Every status change and payment step (§67). Internal notes are for staff only.
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event text not null,
  from_status public.order_status,
  to_status public.order_status,
  actor_id uuid references public.profiles (id),
  note text,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Documents: metadata for files in the private "documents" bucket (§24).
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('enquiry', 'order')),
  owner_id uuid not null,
  document_type public.document_type not null default 'OTHER',
  filename text not null check (length(trim(filename)) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0),
  visible_to_customer boolean not null default true,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index documents_owner_idx on public.documents (owner_type, owner_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  reference_number text,
  payment_date date not null,
  status public.payment_state not null default 'submitted',
  proof_document_id uuid references public.documents (id) on delete set null,
  notes text,
  submitted_by uuid not null default auth.uid() references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status);

-- ---------------------------------------------------------------------------
-- Who can see and act on what
-- ---------------------------------------------------------------------------
create or replace function public.can_see_order(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders x
    where x.id = o and (
      x.customer_id = auth.uid()
      or (x.organization_id is not null and public.is_org_member(x.organization_id))
      or public.is_staff()
    )
  );
$$;

-- Paying for an order is a commercial act, like approving its quotation (§66).
create or replace function public.can_pay_order(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders x
    where x.id = o and (
      x.customer_id = auth.uid()
      or (x.organization_id is not null and exists (
        select 1 from public.organization_members m
        where m.organization_id = x.organization_id and m.user_id = auth.uid()
          and m.role in ('owner', 'admin', 'approver')
      ))
    )
  );
$$;

create or replace function public.can_see_owner(t text, id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case t
    when 'enquiry' then public.can_see_enquiry(id)
    when 'order' then public.can_see_order(id)
    else false
  end;
$$;

create or replace function public.log_order_event(
  o uuid, ev text, from_s public.order_status, to_s public.order_status, note text default null, internal boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.order_events (order_id, event, from_status, to_status, actor_id, note, internal)
  values (o, ev, from_s, to_s, auth.uid(), nullif(trim(note), ''), internal);
$$;
revoke execute on function public.log_order_event(uuid, text, public.order_status, public.order_status, text, boolean)
  from public, anon, authenticated;

-- Paid amount and payment status follow from the payments (§20).
create or replace function public.recalc_order_payment(o uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  total numeric;
  paid numeric;
  pending boolean;
  last_state public.payment_state;
begin
  select grand_total into total from public.orders where id = o;
  select coalesce(sum(amount) filter (where status = 'verified'), 0),
         coalesce(bool_or(status = 'submitted'), false)
    into paid, pending
    from public.payments where order_id = o;
  select status into last_state from public.payments where order_id = o order by created_at desc limit 1;
  update public.orders set
    paid_amount = paid,
    payment_status = case
      when total > 0 and paid >= total then 'paid'
      when pending then 'under_review'
      when paid > 0 then 'partially_paid'
      when last_state = 'rejected' then 'rejected'
      when total = 0 then 'paid'
      else 'unpaid'
    end::public.order_payment_status
  where id = o;
end $$;
revoke execute on function public.recalc_order_payment(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: turn an approved quotation into an order (§18).
-- ---------------------------------------------------------------------------
create or replace function public.create_order(q uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  x public.quotations;
  e public.enquiries;
  o uuid;
  addr text;
begin
  if not public.has_role('order_manager') then
    raise exception 'Only order managers can create orders.' using errcode = '42501';
  end if;
  select * into x from public.quotations where id = q for update;
  if not found then raise exception 'Quotation not found.' using errcode = '22023'; end if;
  if x.status <> 'approved' then
    raise exception 'Only an approved quotation can become an order.' using errcode = '22023';
  end if;
  select * into e from public.enquiries where id = x.enquiry_id;
  select concat_ws(', ', a.line1, a.line2, a.city, a.state, a.pincode) into addr
    from public.addresses a where a.id = e.delivery_address_id;

  insert into public.orders (order_number, enquiry_id, quotation_id, customer_id, organization_id,
    subtotal, tax, discount, delivery, installation, other_charges, grand_total, terms,
    project_name, project_location, delivery_address, created_by)
  values (public.next_document_number('DG'), x.enquiry_id, x.id, x.customer_id, x.organization_id,
    x.subtotal, x.tax, x.discount, x.delivery, x.installation, x.other_charges, x.grand_total, x.terms,
    e.project_name, e.project_location, addr, auth.uid())
  returning id into o;

  insert into public.order_items (order_id, product_id, description, sku, unit, quantity, unit_price,
    tax_rate, line_total, line_tax, sort_order)
  select o, product_id, description, sku, unit, quantity, unit_price, tax_rate, line_total, line_tax, sort_order
    from public.quotation_items where quotation_id = q;

  perform set_config('devgroup.workflow', 'on', true);
  update public.quotations set status = 'converted' where id = q;
  perform set_config('devgroup.workflow', 'off', true);
  update public.enquiries set status = 'converted_to_order' where id = x.enquiry_id;
  perform public.log_commercial_event(x.enquiry_id, q, 'CONVERTED_TO_ORDER');
  perform public.log_order_event(o, 'CREATED', null, 'payment_pending');
  perform public.recalc_order_payment(o);
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: move an order to its next stage (§21). The backend decides what is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.allowed_order_moves(s public.order_status)
returns public.order_status[] language sql immutable set search_path = '' as $$
  select case s
    when 'payment_pending' then array['confirmed', 'cancelled']
    when 'confirmed' then array['processing', 'cancelled']
    when 'processing' then array['in_progress', 'cancelled']
    when 'in_progress' then array['ready_for_dispatch', 'disputed']
    when 'ready_for_dispatch' then array['out_for_delivery', 'disputed']
    when 'out_for_delivery' then array['completed', 'disputed']
    when 'completed' then array['disputed']
    when 'disputed' then array['in_progress', 'completed', 'cancelled']
    else array[]::text[]
  end::public.order_status[];
$$;

create or replace function public.set_order_status(o uuid, new_status public.order_status, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  cur public.order_status;
begin
  if not (public.has_role('order_manager') or public.has_role('project_manager')) then
    raise exception 'Only order or project managers can update an order.' using errcode = '42501';
  end if;
  select status into cur from public.orders where id = o for update;
  if not found then raise exception 'Order not found.' using errcode = '22023'; end if;
  if not new_status = any (public.allowed_order_moves(cur)) then
    raise exception 'An order can''t move from % to %.', replace(cur::text, '_', ' '), replace(new_status::text, '_', ' ')
      using errcode = '22023';
  end if;
  if new_status in ('cancelled', 'disputed') and coalesce(trim(note), '') = '' then
    raise exception 'Add a note saying why.' using errcode = '22023';
  end if;
  update public.orders set status = new_status where id = o;
  perform public.log_order_event(o, 'STATUS', cur, new_status, note);
end $$;

-- Staff: a note on the order. Internal notes are hidden from the customer.
create or replace function public.add_order_note(o uuid, note text, internal boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Only staff can add notes.' using errcode = '42501'; end if;
  if coalesce(trim(note), '') = '' then raise exception 'Write a note first.' using errcode = '22023'; end if;
  if not exists (select 1 from public.orders where id = o) then
    raise exception 'Order not found.' using errcode = '22023';
  end if;
  perform public.log_order_event(o, 'NOTE', null, null, note, internal);
end $$;

-- ---------------------------------------------------------------------------
-- Documents. The file is uploaded to storage first, then registered here.
-- ---------------------------------------------------------------------------
create or replace function public.add_document(
  owner_type text, owner_id uuid, document_type public.document_type, filename text,
  storage_path text, mime_type text, size_bytes int, visible_to_customer boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d uuid;
  staff boolean := public.is_staff();
begin
  if owner_type not in ('enquiry', 'order') or not public.can_see_owner(owner_type, owner_id) then
    raise exception 'You can''t add files here.' using errcode = '42501';
  end if;
  if not staff and document_type in ('INVOICE', 'QUOTATION_PDF', 'DELIVERY_DOCUMENT') then
    raise exception 'Only DEV staff can add that kind of document.' using errcode = '42501';
  end if;
  if storage_path not like owner_type || '/' || owner_id || '/%' then
    raise exception 'The file is in the wrong place.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'documents' and name = storage_path) then
    raise exception 'Upload the file first.' using errcode = '22023';
  end if;
  insert into public.documents (owner_type, owner_id, document_type, filename, storage_path, mime_type,
    size_bytes, visible_to_customer)
  values (owner_type, owner_id, document_type, trim(filename), storage_path, mime_type, size_bytes,
    case when staff then visible_to_customer else true end)
  returning id into d;
  if owner_type = 'order' then
    perform public.log_order_event(owner_id, 'DOCUMENT', null, null, trim(filename), not (case when staff then visible_to_customer else true end));
  end if;
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- Payments (§19-20, §41)
-- ---------------------------------------------------------------------------
create or replace function public.submit_payment(
  o uuid, amount numeric, method public.payment_method, reference_number text,
  payment_date date, notes text default null, proof_document_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  x public.orders;
  p uuid;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into x from public.orders where id = o for update;
  if not found or not (public.can_pay_order(o) or public.has_role('finance')) then
    raise exception 'Only the customer, or an organization admin or approver, can record a payment.' using errcode = '42501';
  end if;
  if x.status in ('cancelled', 'completed') then
    raise exception 'This order is closed.' using errcode = '22023';
  end if;
  if amount is null or amount <= 0 then raise exception 'Enter the amount paid.' using errcode = '22023'; end if;
  -- Payments still being checked count against what is due, so the same money isn't sent twice.
  if amount > x.grand_total - x.paid_amount
      - coalesce((select sum(y.amount) from public.payments y where y.order_id = o and y.status = 'submitted'), 0) then
    raise exception 'That is more than the amount due (payments being checked included).' using errcode = '22023';
  end if;
  if payment_date is null or payment_date > today then
    raise exception 'Enter the date you paid (not a future date).' using errcode = '22023';
  end if;
  if method <> 'cash' and coalesce(trim(reference_number), '') = '' then
    raise exception 'Enter the transaction or cheque reference.' using errcode = '22023';
  end if;
  if proof_document_id is not null and not exists (
    select 1 from public.documents d where d.id = proof_document_id and d.owner_type = 'order' and d.owner_id = o
  ) then
    raise exception 'The proof must be a file on this order.' using errcode = '22023';
  end if;
  insert into public.payments (order_id, amount, method, reference_number, payment_date, notes, proof_document_id)
  values (o, round(amount, 2), method, nullif(trim(reference_number), ''), payment_date, nullif(trim(notes), ''), proof_document_id)
  returning id into p;
  perform public.log_order_event(o, 'PAYMENT_SUBMITTED', null, null,
    '₹' || to_char(round(amount, 2), 'FM99,99,99,99,990.00') || ' by ' || replace(method::text, '_', ' '));
  perform public.recalc_order_payment(o);
  return p;
end $$;

create or replace function public.review_payment(p uuid, decision text, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.payments;
begin
  if not public.has_role('finance') then
    raise exception 'Only finance staff can verify payments.' using errcode = '42501';
  end if;
  if decision not in ('verify', 'reject') then raise exception 'Unknown decision.' using errcode = '22023'; end if;
  select * into x from public.payments where id = p for update;
  if not found then raise exception 'Payment not found.' using errcode = '22023'; end if;
  if x.status <> 'submitted' then raise exception 'This payment has already been reviewed.' using errcode = '22023'; end if;
  if decision = 'reject' and coalesce(trim(note), '') = '' then
    raise exception 'Tell the customer why the payment was rejected.' using errcode = '22023';
  end if;
  update public.payments set
    status = case decision when 'verify' then 'verified' else 'rejected' end::public.payment_state,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(note), '')
  where id = p;
  perform public.log_order_event(x.order_id,
    case decision when 'verify' then 'PAYMENT_VERIFIED' else 'PAYMENT_REJECTED' end, null, null,
    concat_ws(' · ', '₹' || to_char(x.amount, 'FM99,99,99,99,990.00'), nullif(trim(note), '')));
  perform public.recalc_order_payment(x.order_id);
end $$;

-- ---------------------------------------------------------------------------
-- Access rules. Customers change nothing directly: everything goes through the functions.
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;

create policy orders_select on public.orders for select to authenticated using (public.can_see_order(id));
-- Staff set the expected delivery date and the manager directly.
create policy orders_staff_update on public.orders for update to authenticated
  using (public.has_role('order_manager')) with check (public.has_role('order_manager'));
create policy order_items_select on public.order_items for select to authenticated using (public.can_see_order(order_id));
create policy order_events_select on public.order_events for select to authenticated
  using (public.can_see_order(order_id) and (not internal or public.is_staff()));
create policy payments_select on public.payments for select to authenticated using (public.can_see_order(order_id));
create policy documents_select on public.documents for select to authenticated
  using (public.can_see_owner(owner_type, owner_id) and (visible_to_customer or public.is_staff()));

grant select on public.orders, public.order_items, public.order_events, public.payments, public.documents to authenticated;
grant update (expected_delivery, assigned_manager_id) on public.orders to authenticated;

-- Private bucket for everything that isn't a catalogue photo. 10 MB, PDFs and photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload into the folder of an enquiry or order you can see: <owner type>/<owner id>/<file>.
create policy documents_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and split_part(name, '/', 1) in ('enquiry', 'order')
    and split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$'
    and public.can_see_owner(split_part(name, '/', 1), split_part(name, '/', 2)::uuid)
  );
-- Read a registered file you're allowed to see, or one you just uploaded and haven't registered yet.
create policy documents_read on storage.objects for select to authenticated
  using (
    bucket_id = 'documents' and (
      owner = auth.uid()
      or exists (
        select 1 from public.documents d
        where d.storage_path = name
          and public.can_see_owner(d.owner_type, d.owner_id)
          and (d.visible_to_customer or public.is_staff())
      )
    )
  );

revoke execute on function public.can_see_order(uuid), public.can_pay_order(uuid), public.can_see_owner(text, uuid),
  public.create_order(uuid), public.allowed_order_moves(public.order_status),
  public.set_order_status(uuid, public.order_status, text), public.add_order_note(uuid, text, boolean),
  public.add_document(text, uuid, public.document_type, text, text, text, int, boolean),
  public.submit_payment(uuid, numeric, public.payment_method, text, date, text, uuid),
  public.review_payment(uuid, text, text)
  from public, anon;
grant execute on function public.can_see_order(uuid), public.can_pay_order(uuid), public.can_see_owner(text, uuid),
  public.create_order(uuid), public.allowed_order_moves(public.order_status),
  public.set_order_status(uuid, public.order_status, text), public.add_order_note(uuid, text, boolean),
  public.add_document(text, uuid, public.document_type, text, text, text, int, boolean),
  public.submit_payment(uuid, numeric, public.payment_method, text, date, text, uuid),
  public.review_payment(uuid, text, text)
  to authenticated;

-- Where customers send money. Shown on the payment screen; fill in from the dashboard.
insert into public.app_config (key, value) values
  ('payment_details', '{"account_name": "", "bank_name": "", "account_number": "", "ifsc": "", "upi_id": "", "note": ""}')
on conflict (key) do nothing;

-- Letterhead for quotation PDFs (§53). GSTIN and email are added when known.
insert into public.app_config (key, value) values
  ('company_details', '{"name": "DEV Group", "address": "Bhiti Rawat, Sahjanwa, Gorakhpur – 273209, Uttar Pradesh", "phone": "+91 78975 93597", "email": "", "gstin": "", "website": "devgroupsn.com"}')
on conflict (key) do nothing;

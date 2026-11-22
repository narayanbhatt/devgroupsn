-- Access-rule tests. Run after supabase_stub.sql, the migrations and seed.sql.
-- Each check raises an exception on failure; psql runs with ON_ERROR_STOP.
-- Everything happens in one transaction that is rolled back at the end.
\set ON_ERROR_STOP on
begin;

-- Users: a = customer Alice, b = customer Bob, c = catalogue admin, d = super admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"name":"Bob","customer_type":"government","phone":"9876543210"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com', '{"customer_type":"super_admin"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cat@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'root@example.com', '{}');
insert into public.staff_roles (user_id, role) values
  ('00000000-0000-0000-0000-00000000000c', 'catalog_admin'),
  ('00000000-0000-0000-0000-00000000000d', 'super_admin');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

select pg_temp.check((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice',
  'signup creates a profile with the name from sign-in metadata');
select pg_temp.check((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Bob',
  'Google-style "name" metadata is used too');
select pg_temp.check((select customer_type::text || phone from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'government9876543210',
  'customer type and phone from sign-up are kept');
select pg_temp.check((select customer_type from public.profiles where id = '00000000-0000-0000-0000-00000000000e') = 'individual',
  'an unexpected customer type falls back to individual');

-- ---------------------------------------------------------------- anonymous
set local role anon;
select pg_temp.check((select count(*) from public.products) = 10, 'anonymous visitors see the 10 published products');
do $$ begin
  perform count(*) from public.profiles;
  raise exception 'FAILED: anonymous visitor read profiles';
exception when insufficient_privilege then raise notice 'ok - anonymous visitors cannot read profiles';
end $$;
do $$ begin
  insert into public.products (sku, name, category_id) select 'X', 'X', id from public.categories limit 1;
  raise exception 'FAILED: anonymous visitor added a product';
exception when insufficient_privilege then raise notice 'ok - anonymous visitors cannot change the catalogue';
end $$;
reset role;

-- ---------------------------------------------------------------- Alice (customer)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select pg_temp.check((select count(*) from public.profiles) = 1, 'a customer sees only their own profile');
select pg_temp.check(not public.is_staff(), 'a customer is not staff');

update public.profiles set full_name = 'Alice B' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select full_name from public.profiles) = 'Alice B', 'a customer can edit their own name');

do $$ begin
  update public.profiles set status = 'disabled' where id = auth.uid();
  raise exception 'FAILED: customer changed own account status';
exception when insufficient_privilege then raise notice 'ok - a customer cannot change their account status';
end $$;

do $$ declare n int; begin
  update public.products set listed_price = 1 where sku = 'FUR-RCC-BENCH';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: customer changed a price'; end if;
  raise notice 'ok - a customer cannot change catalogue prices';
end $$;

do $$ begin
  insert into public.staff_roles (user_id, role) values (auth.uid(), 'super_admin');
  raise exception 'FAILED: customer granted themselves a staff role';
exception when insufficient_privilege then raise notice 'ok - a customer cannot make themselves staff';
end $$;

insert into public.organizations (name, type, gstin)
  values ('Acme Infra Pvt Ltd', 'business', '29ABCDE1234F1Z5');
select pg_temp.check((select role from public.organization_members where user_id = auth.uid()) = 'owner',
  'creating an organization makes you its owner');
insert into public.addresses (user_id, line1, city, state, pincode)
  values (auth.uid(), '12 MG Road', 'Bengaluru', 'Karnataka', '560001');
reset role;

-- ---------------------------------------------------------------- Bob (other customer)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.organizations) = 0, 'a customer cannot see another customer''s organization');
select pg_temp.check((select count(*) from public.addresses) = 0, 'a customer cannot see another customer''s addresses');
select pg_temp.check((select count(*) from public.audit_logs) = 0, 'a customer cannot read the audit log');
reset role;

-- ---------------------------------------------------------------- catalogue admin
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(public.is_staff(), 'catalogue admin is staff');
update public.products set listed_price = 2300 where sku = 'FUR-RCC-BENCH';
select pg_temp.check((select listed_price from public.products where sku = 'FUR-RCC-BENCH') = 2300,
  'a catalogue admin can change a price');
insert into public.products (sku, name, category_id, status)
  select 'TEST-DRAFT', 'Draft item', id, 'draft' from public.categories where slug = 'services';
do $$ begin
  insert into public.staff_roles (user_id, role) values (auth.uid(), 'finance');
  raise exception 'FAILED: catalogue admin granted a role';
exception when insufficient_privilege then raise notice 'ok - a catalogue admin cannot grant staff roles';
end $$;
reset role;

-- drafts are hidden from customers
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.products where sku = 'TEST-DRAFT') = 0, 'customers do not see draft products');
reset role;

-- ---------------------------------------------------------------- super admin
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) from public.audit_logs where action = 'PRICE_CHANGED') = 1,
  'the price change was written to the audit log');
select pg_temp.check((select count(*) from public.profiles) = 5, 'super admin sees every profile');
update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-00000000000c';
reset role;

-- a disabled staff account loses staff access
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(not public.is_staff(), 'a disabled staff account loses staff access');
reset role;

rollback;

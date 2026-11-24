-- Enquiry and quotation workflow tests (Phase 3). Rolled back at the end.
\set ON_ERROR_STOP on
begin;

-- a = customer Alice, b = customer Bob, m = order manager, c = catalogue admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'om@example.com', '{"full_name":"Om"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cat@example.com', '{}');
insert into public.staff_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'order_manager'),
  ('00000000-0000-0000-0000-00000000000c', 'catalog_admin');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
create table pg_temp.ids (k text primary key, v uuid);
grant all on pg_temp.ids to authenticated;

-- ------------------------------------------------------------ Alice sends an enquiry
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into pg_temp.ids values ('enq', public.submit_enquiry(
  '{"project_name":"Ward 12 park","contact_person":"Alice","phone":"9876543210","project_location":"Gorakhpur","required_by":"2026-12-31"}',
  (select jsonb_agg(jsonb_build_object('product_id', id, 'quantity', q)) from (
     select id, case sku when 'FUR-RCC-BENCH' then 100 else 50 end as q
     from public.products where sku in ('FUR-RCC-BENCH', 'SAN-DUSTBIN')) s)
));
select pg_temp.check((select enquiry_number ~ '^ENQ-[0-9]{4}-0001$' from public.enquiries), 'enquiry gets the first ENQ number of the year');
select pg_temp.check((select count(*) from public.enquiry_items) = 2, 'enquiry items are saved');
select pg_temp.check((select listed_price from public.enquiry_items where sku = 'FUR-RCC-BENCH') = 2200,
  'the listed price is copied onto the enquiry');
do $$ begin
  perform public.submit_enquiry('{"contact_person":"A","phone":"1"}', '[]');
  raise exception 'FAILED: empty enquiry accepted';
exception when invalid_parameter_value then raise notice 'ok - an empty enquiry is refused';
end $$;
do $$ begin
  insert into public.enquiries (enquiry_number, customer_id, contact_person, phone)
  values ('ENQ-FAKE', auth.uid(), 'x', 'y');
  raise exception 'FAILED: customer inserted an enquiry directly';
exception when insufficient_privilege then raise notice 'ok - customers cannot insert enquiries directly';
end $$;
do $$ begin
  perform public.create_quotation((select v from pg_temp.ids where k = 'enq'));
  raise exception 'FAILED: customer created a quotation';
exception when insufficient_privilege then raise notice 'ok - customers cannot create quotations';
end $$;
reset role;

-- Bob can't see Alice's enquiry
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.enquiries) = 0, 'customers only see their own enquiries');
select pg_temp.check((select count(*) from public.enquiry_items) = 0, 'and only their own enquiry items');
reset role;

-- A catalogue admin is staff but can't quote
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  perform public.create_quotation((select v from pg_temp.ids where k = 'enq'));
  raise exception 'FAILED: catalogue admin created a quotation';
exception when insufficient_privilege then raise notice 'ok - only order managers prepare quotations';
end $$;
reset role;

-- ------------------------------------------------------------ order manager quotes
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) from public.enquiries) = 1, 'order manager sees every enquiry');
select public.set_enquiry_status((select v from pg_temp.ids where k = 'enq'), 'under_review');
insert into pg_temp.ids values ('q1', public.create_quotation((select v from pg_temp.ids where k = 'enq')));
select pg_temp.check((select quotation_number ~ '^Q-[0-9]{4}-0001$' and version = 1 and status = 'draft'
  from public.quotations), 'draft quotation Q-…-0001 v1 is created');
select pg_temp.check((select subtotal = 265000 and tax = 47700 and grand_total = 312700 from public.quotations),
  'totals: 100 x 2200 + 50 x 900 = 265000, GST 18% = 47700');
update public.quotation_items set unit_price = 2000 where sku = 'FUR-RCC-BENCH';
update public.quotations set delivery = 5000, discount = 1000 where id = (select v from pg_temp.ids where k = 'q1');
select pg_temp.check((select subtotal = 245000 and tax = 44100 and grand_total = 293100 from public.quotations),
  'editing a draft recalculates: 245000 + 44100 + 5000 delivery - 1000 discount');
reset role;

-- Alice can't see the draft
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.quotations) = 0, 'customers do not see draft quotations');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.send_quotation((select v from pg_temp.ids where k = 'q1'));
select pg_temp.check((select status = 'sent' from public.quotations), 'quotation is sent');
select pg_temp.check((select status = 'quoted' from public.enquiries), 'enquiry moves to quoted');
do $$ begin
  update public.quotation_items set unit_price = 1 where sku = 'FUR-RCC-BENCH';
  raise exception 'FAILED: sent quotation item edited';
exception when insufficient_privilege then raise notice 'ok - a sent quotation''s prices cannot be edited';
end $$;
do $$ begin
  update public.quotations set discount = 99999 where id = (select v from pg_temp.ids where k = 'q1');
  raise exception 'FAILED: sent quotation edited';
exception when insufficient_privilege then raise notice 'ok - a sent quotation cannot be edited';
end $$;
reset role;

-- ------------------------------------------------------------ Alice answers
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.mark_quotation_viewed((select v from pg_temp.ids where k = 'q1'));
select pg_temp.check((select status = 'viewed' from public.quotations), 'opening it marks the quotation viewed');
update public.quotations set discount = 99999;
update public.quotation_items set unit_price = 1;
reset role;
select pg_temp.check((select discount = 1000 from public.quotations) and not exists (select 1 from public.quotation_items where unit_price = 1),
  'customers cannot change quotation prices');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  perform public.answer_quotation((select v from pg_temp.ids where k = 'q1'), 'revise', '');
  raise exception 'FAILED: revision without a note';
exception when invalid_parameter_value then raise notice 'ok - a revision request needs a note';
end $$;
select pg_temp.check(public.answer_quotation((select v from pg_temp.ids where k = 'q1'), 'revise', 'Benches at 1900 please')
  = 'revision_requested', 'customer asks for a revision');
reset role;

-- Bob can't answer Alice's quotation
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform public.answer_quotation((select v from pg_temp.ids where k = 'q1'), 'approve');
  raise exception 'FAILED: another customer approved';
exception when insufficient_privilege then raise notice 'ok - another customer cannot approve';
end $$;
reset role;

-- ------------------------------------------------------------ revision v2
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into pg_temp.ids values ('q2', public.create_quotation_revision((select v from pg_temp.ids where k = 'q1')));
update public.quotation_items set unit_price = 1900
  where sku = 'FUR-RCC-BENCH' and quotation_id = (select v from pg_temp.ids where k = 'q2');
select public.send_quotation((select v from pg_temp.ids where k = 'q2'));
select pg_temp.check((select version = 2 and status = 'sent' from public.quotations where id = (select v from pg_temp.ids where k = 'q2')),
  'version 2 is sent with the same number');
select pg_temp.check((select status = 'superseded' from public.quotations where id = (select v from pg_temp.ids where k = 'q1')),
  'version 1 is superseded');
select pg_temp.check((select unit_price = 2000 from public.quotation_items
  where sku = 'FUR-RCC-BENCH' and quotation_id = (select v from pg_temp.ids where k = 'q1')), 'version 1 prices are unchanged');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  perform public.answer_quotation((select v from pg_temp.ids where k = 'q1'), 'approve');
  raise exception 'FAILED: superseded version approved';
exception when invalid_parameter_value then raise notice 'ok - a superseded version cannot be approved';
end $$;
select pg_temp.check(public.answer_quotation((select v from pg_temp.ids where k = 'q2'), 'approve') = 'approved',
  'customer approves version 2');
select pg_temp.check((select status = 'approved' from public.enquiries), 'enquiry is approved');
select pg_temp.check((select array_agg(event order by created_at, event) from public.commercial_events)
  @> array['ENQUIRY_SUBMITTED', 'QUOTATION_CREATED', 'SENT', 'VIEWED', 'REVISION_REQUESTED', 'VERSION_CREATED', 'APPROVED'],
  'every step is in the commercial event log');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.create_quotation_revision((select v from pg_temp.ids where k = 'q2'));
  raise exception 'FAILED: approved quotation revised';
exception when invalid_parameter_value then raise notice 'ok - an approved quotation cannot be revised';
end $$;
reset role;

-- ------------------------------------------------------------ expiry
reset role;
set local devgroup.workflow = 'on';
update public.quotations set valid_until = current_date - 1, status = 'sent' where id = (select v from pg_temp.ids where k = 'q1');
set local devgroup.workflow = 'off';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(public.answer_quotation((select v from pg_temp.ids where k = 'q1'), 'approve') = 'expired',
  'an expired quotation cannot be approved');
select pg_temp.check((select status = 'expired' from public.quotations where id = (select v from pg_temp.ids where k = 'q1')),
  'and is marked expired');
reset role;

-- ------------------------------------------------------------ deleting a draft
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into pg_temp.ids values ('enq2', public.submit_enquiry('{"contact_person":"Bob","phone":"9876543211"}',
  (select jsonb_agg(jsonb_build_object('product_id', id, 'quantity', 1)) from public.products where sku = 'LGT-STREET-45W')));
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into pg_temp.ids values ('q3', public.create_quotation((select v from pg_temp.ids where k = 'enq2')));
delete from public.quotations where id = (select v from pg_temp.ids where k = 'q3');
select pg_temp.check((select count(*) from public.quotation_items where quotation_id = (select v from pg_temp.ids where k = 'q3')) = 0,
  'a draft quotation can be deleted with its items');
reset role;

-- Bob cancels
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.cancel_enquiry((select v from pg_temp.ids where k = 'enq2'), 'Budget not approved');
select pg_temp.check((select status = 'cancelled' from public.enquiries), 'customer can cancel an open enquiry');
reset role;

rollback;

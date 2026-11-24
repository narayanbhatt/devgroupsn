-- Order, payment and document workflow tests (Phase 4). Rolled back at the end.
\set ON_ERROR_STOP on
begin;

-- a = customer Alice, b = customer Bob, m = order manager, f = finance
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'om@example.com', '{"full_name":"Om"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'fin@example.com', '{"full_name":"Fin"}');
insert into public.staff_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'order_manager'),
  ('00000000-0000-0000-0000-0000000000f1', 'finance');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
create table pg_temp.ids (k text primary key, v uuid);
grant all on pg_temp.ids to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$ select v from pg_temp.ids where k = key $$;
grant execute on function pg_temp.id(text) to authenticated;

-- ------------------------------------------------------------ an approved quotation
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into pg_temp.ids values ('enq', public.submit_enquiry(
  '{"contact_person":"Alice","phone":"9876543210","project_location":"Gorakhpur","project_name":"Ward 12 park"}',
  (select jsonb_agg(jsonb_build_object('product_id', id, 'quantity', 10)) from public.products where sku = 'FUR-RCC-BENCH')));
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into pg_temp.ids values ('q', public.create_quotation(pg_temp.id('enq')));
update public.quotations set delivery = 1000 where id = pg_temp.id('q');
select public.send_quotation(pg_temp.id('q'));
do $$ begin
  perform public.create_order(pg_temp.id('q'));
  raise exception 'FAILED: order from an unapproved quotation';
exception when invalid_parameter_value then raise notice 'ok - only an approved quotation becomes an order';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.answer_quotation(pg_temp.id('q'), 'approve');
do $$ begin
  perform public.create_order(pg_temp.id('q'));
  raise exception 'FAILED: customer created an order';
exception when insufficient_privilege then raise notice 'ok - customers cannot create orders';
end $$;
reset role;

-- ------------------------------------------------------------ order conversion
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into pg_temp.ids values ('o', public.create_order(pg_temp.id('q')));
select pg_temp.check((select order_number ~ '^DG-[0-9]{4}-0001$' from public.orders), 'order gets the first DG number');
-- 10 benches × 2200 = 22000, GST 18% = 3960, delivery 1000
select pg_temp.check((select grand_total = 26960 and status = 'payment_pending' and payment_status = 'unpaid'
  from public.orders where id = pg_temp.id('o')), 'order copies the quotation total and starts unpaid');
select pg_temp.check((select count(*) = 1 from public.order_items where order_id = pg_temp.id('o')), 'order items are copied');
select pg_temp.check((select status = 'converted' from public.quotations where id = pg_temp.id('q')), 'quotation is marked converted');
select pg_temp.check((select status = 'converted_to_order' from public.enquiries where id = pg_temp.id('enq')), 'enquiry is marked converted');
do $$ begin
  perform public.create_order(pg_temp.id('q'));
  raise exception 'FAILED: second order from one quotation';
exception when invalid_parameter_value then raise notice 'ok - a quotation becomes at most one order';
end $$;

-- Prices in the catalogue change later; the order doesn't.
reset role;
update public.products set listed_price = 9999 where sku = 'FUR-RCC-BENCH';
select pg_temp.check((select unit_price = 2200 from public.order_items where order_id = pg_temp.id('o')),
  'later catalogue price changes do not touch the order');

-- ------------------------------------------------------------ stages
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.set_order_status(pg_temp.id('o'), 'completed');
  raise exception 'FAILED: skipped stages';
exception when invalid_parameter_value then raise notice 'ok - an order cannot skip stages';
end $$;
do $$ begin
  perform public.set_order_status(pg_temp.id('o'), 'cancelled', '');
  raise exception 'FAILED: cancelled without a reason';
exception when invalid_parameter_value then raise notice 'ok - cancelling needs a reason';
end $$;
select public.set_order_status(pg_temp.id('o'), 'confirmed', 'Advance terms agreed');
select public.add_order_note(pg_temp.id('o'), 'Customer prefers morning delivery', true);
select pg_temp.check((select status = 'confirmed' from public.orders where id = pg_temp.id('o')), 'manager confirms the order');
do $$ begin
  update public.orders set grand_total = 1 where id = pg_temp.id('o');
  raise exception 'FAILED: staff edited the order total';
exception when insufficient_privilege then raise notice 'ok - nobody edits the order total directly';
end $$;
update public.orders set expected_delivery = '2027-01-15' where id = pg_temp.id('o');
reset role;

-- ------------------------------------------------------------ customer view
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) = 1 from public.orders), 'customer sees their order');
select pg_temp.check((select count(*) from public.order_events where order_id = pg_temp.id('o')) = 2,
  'customer sees the timeline but not internal notes');
do $$ begin
  perform public.set_order_status(pg_temp.id('o'), 'processing');
  raise exception 'FAILED: customer moved the order';
exception when insufficient_privilege then raise notice 'ok - customers cannot move orders';
end $$;

-- Payment proof: upload to the order folder, register it, then record the payment.
insert into storage.objects (bucket_id, name) values ('documents', 'order/' || pg_temp.id('o') || '/proof.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('documents', 'order/' || gen_random_uuid() || '/x.jpg');
  raise exception 'FAILED: upload into an unknown order folder';
exception when insufficient_privilege then raise notice 'ok - uploads only go into your own order folders';
end $$;
insert into pg_temp.ids values ('proof', public.add_document('order', pg_temp.id('o'), 'PAYMENT_PROOF', 'proof.jpg',
  'order/' || pg_temp.id('o') || '/proof.jpg', 'image/jpeg', 1000));
do $$ begin
  perform public.add_document('order', pg_temp.id('o'), 'INVOICE', 'fake.pdf',
    'order/' || pg_temp.id('o') || '/proof.jpg', 'application/pdf', 10);
  raise exception 'FAILED: customer added an invoice';
exception when insufficient_privilege then raise notice 'ok - customers cannot add invoices';
end $$;
do $$ begin
  perform public.submit_payment(pg_temp.id('o'), 99999, 'upi', 'UTR1', current_date);
  raise exception 'FAILED: overpayment accepted';
exception when invalid_parameter_value then raise notice 'ok - a payment cannot exceed the amount due';
end $$;
do $$ begin
  perform public.submit_payment(pg_temp.id('o'), 100, 'upi', '', current_date);
  raise exception 'FAILED: UPI payment without reference';
exception when invalid_parameter_value then raise notice 'ok - a reference is required';
end $$;
insert into pg_temp.ids values ('p1', public.submit_payment(pg_temp.id('o'), 10000, 'upi', 'UTR123', current_date,
  'Advance', pg_temp.id('proof')));
select pg_temp.check((select payment_status = 'under_review' and paid_amount = 0 from public.orders), 'a submitted payment is under review');
do $$ begin
  perform public.submit_payment(pg_temp.id('o'), 26960, 'upi', 'UTR124', current_date);
  raise exception 'FAILED: paid twice while the first payment is being checked';
exception when invalid_parameter_value then raise notice 'ok - money being checked counts against the amount due';
end $$;
do $$ begin
  perform public.review_payment(pg_temp.id('p1'), 'verify');
  raise exception 'FAILED: customer verified their own payment';
exception when insufficient_privilege then raise notice 'ok - customers cannot verify payments';
end $$;
reset role;

-- Bob sees none of it
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.orders) = 0 and (select count(*) from public.payments) = 0
  and (select count(*) from public.documents) = 0, 'other customers see no orders, payments or documents');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents') = 0, 'or the files');
do $$ begin
  perform public.submit_payment(pg_temp.id('o'), 1, 'cash', null, current_date);
  raise exception 'FAILED: Bob paid for Alice''s order';
exception when insufficient_privilege then raise notice 'ok - only the customer can record a payment';
end $$;
reset role;

-- ------------------------------------------------------------ finance
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.review_payment(pg_temp.id('p1'), 'verify');
  raise exception 'FAILED: order manager verified a payment';
exception when insufficient_privilege then raise notice 'ok - only finance verifies payments';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.check((select count(*) = 1 from storage.objects where bucket_id = 'documents'), 'finance can open the proof');
select public.review_payment(pg_temp.id('p1'), 'verify');
select pg_temp.check((select payment_status = 'partially_paid' and paid_amount = 10000 from public.orders), 'verified advance makes it partially paid');
do $$ begin
  perform public.review_payment(pg_temp.id('p1'), 'reject', 'oops');
  raise exception 'FAILED: reviewed twice';
exception when invalid_parameter_value then raise notice 'ok - a payment is reviewed once';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into pg_temp.ids values ('p2', public.submit_payment(pg_temp.id('o'), 16960, 'cheque', 'CHQ 000123', current_date));
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  perform public.review_payment(pg_temp.id('p2'), 'reject', '');
  raise exception 'FAILED: rejected without reason';
exception when invalid_parameter_value then raise notice 'ok - rejecting needs a reason';
end $$;
select public.review_payment(pg_temp.id('p2'), 'reject', 'Cheque bounced');
select pg_temp.check((select payment_status = 'partially_paid' and paid_amount = 10000 from public.orders), 'a rejected payment adds nothing');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into pg_temp.ids values ('p3', public.submit_payment(pg_temp.id('o'), 16960, 'bank_transfer', 'NEFT 998', current_date));
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.review_payment(pg_temp.id('p3'), 'verify');
select pg_temp.check((select payment_status = 'paid' and paid_amount = 26960 from public.orders), 'fully verified makes it paid');
reset role;

-- ------------------------------------------------------------ staff documents
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into storage.objects (bucket_id, name) values ('documents', 'order/' || pg_temp.id('o') || '/internal.pdf');
select public.add_document('order', pg_temp.id('o'), 'OTHER', 'internal.pdf',
  'order/' || pg_temp.id('o') || '/internal.pdf', 'application/pdf', 10, false);
insert into storage.objects (bucket_id, name) values ('documents', 'order/' || pg_temp.id('o') || '/invoice.pdf');
select public.add_document('order', pg_temp.id('o'), 'INVOICE', 'invoice.pdf',
  'order/' || pg_temp.id('o') || '/invoice.pdf', 'application/pdf', 10);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.documents) = 2, 'customer sees the invoice and their proof, not internal files');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents' and name like '%internal.pdf') = 0,
  'and cannot open the internal file');
reset role;

rollback;

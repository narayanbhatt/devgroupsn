-- Chat tests. Rolled back at the end.
\set ON_ERROR_STOP on
begin;

-- a = customer Alice, b = customer Bob, m = order manager
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'om@example.com', '{"full_name":"Om"}');
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'order_manager');

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
create function pg_temp.fails(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.fails(text) to authenticated;

-- ------------------------------------------------------------ Alice opens chats
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into pg_temp.ids values ('enq', public.submit_enquiry(
  '{"contact_person":"Alice","phone":"9876543210","project_location":"Gorakhpur"}',
  (select jsonb_agg(jsonb_build_object('product_id', id, 'quantity', 2)) from public.products where sku = 'FUR-RCC-BENCH')));
insert into pg_temp.ids values ('general', public.open_conversation());
insert into pg_temp.ids values ('about_enq', public.open_conversation('enquiry', pg_temp.id('enq')));
select pg_temp.check(public.open_conversation() = pg_temp.id('general'), 'opening the general chat again returns the same one');
select pg_temp.check(pg_temp.id('general') <> pg_temp.id('about_enq'), 'an enquiry has its own chat');
select pg_temp.check(pg_temp.fails($q$select public.open_conversation('general', null, '00000000-0000-0000-0000-00000000000b')$q$),
  'a customer can''t open a chat for someone else');
select pg_temp.check(pg_temp.fails($q$select public.open_conversation('order', gen_random_uuid())$q$),
  'a customer can''t open a chat about an order they can''t see');
select pg_temp.check(pg_temp.fails(format('select public.send_message(%L, %L)', pg_temp.id('general'), '   ')),
  'an empty message is refused');
select pg_temp.check(pg_temp.fails(format('select public.send_message(%L, %L)', pg_temp.id('general'), repeat('x', 4001))),
  'a message over 4,000 characters is refused');
insert into pg_temp.ids values ('m1', public.send_message(pg_temp.id('about_enq'), '  Can you share the revised timeline?  '));
select pg_temp.check((select body from public.messages where id = pg_temp.id('m1')) = 'Can you share the revised timeline?',
  'message text is trimmed');
select pg_temp.check(pg_temp.fails(
  $q$insert into public.messages (conversation_id, body) values ((select id from public.conversations limit 1), 'x')$q$),
  'messages can''t be inserted directly');
select pg_temp.check(pg_temp.fails(format('select public.send_message(%L, null, %L, %L)', pg_temp.id('about_enq'),
  'conversation/' || pg_temp.id('about_enq') || '/missing.pdf', 'missing.pdf')), 'a file must be uploaded before it is sent');
select pg_temp.check(pg_temp.fails(format('select public.send_message(%L, null, %L, %L)', pg_temp.id('about_enq'),
  'order/' || pg_temp.id('about_enq') || '/x.pdf', 'x.pdf')), 'a file outside the chat''s folder is refused');
reset role;

-- A file Alice uploaded into her chat's folder.
insert into storage.objects (bucket_id, name, owner)
values ('documents', 'conversation/' || pg_temp.id('about_enq') || '/plan.pdf', '00000000-0000-0000-0000-00000000000a');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.send_message(pg_temp.id('about_enq'), null, 'conversation/' || pg_temp.id('about_enq') || '/plan.pdf',
  'plan.pdf', 'application/pdf', 1200);
select pg_temp.check((select last_message_preview from public.conversations where id = pg_temp.id('about_enq')) = '📎 plan.pdf',
  'a file-only message shows the file name in the chat list');
select pg_temp.check((select unread from public.list_conversations() where id = pg_temp.id('about_enq')) = 0,
  'your own messages are not unread');
reset role;

-- ------------------------------------------------------------ Bob sees none of it
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.conversations) = 0, 'another customer can''t see Alice''s chats');
select pg_temp.check((select count(*) from public.messages) = 0, 'another customer can''t read Alice''s messages');
select pg_temp.check((select count(*) from public.list_conversations()) = 0, 'another customer''s chat list is empty');
select pg_temp.check(pg_temp.fails(format('select public.send_message(%L, %L)', pg_temp.id('about_enq'), 'hi')),
  'another customer can''t post in Alice''s chat');
select pg_temp.check(pg_temp.fails(format('select public.open_conversation(%L, %L)', 'enquiry', pg_temp.id('enq'))),
  'another customer can''t open a chat about Alice''s enquiry');
select pg_temp.check((select count(*) from storage.objects where name like 'conversation/%') = 0,
  'another customer can''t read Alice''s chat files');
reset role;

-- ------------------------------------------------------------ Staff reply
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select unread from public.list_conversations() where id = pg_temp.id('about_enq')) = 2,
  'staff see two unread messages');
select pg_temp.check((select customer_name from public.list_conversations() where id = pg_temp.id('about_enq')) = 'Alice',
  'the chat list names the customer');
select pg_temp.check(not exists (select 1 from public.list_conversations() where id = pg_temp.id('general')),
  'an empty chat is not listed for staff');
select pg_temp.check((select count(*) from storage.objects where name like 'conversation/%') = 1, 'staff can read the chat file');
select public.mark_conversation_read(pg_temp.id('about_enq'));
select pg_temp.check((select unread from public.list_conversations() where id = pg_temp.id('about_enq')) = 0,
  'reading the chat clears unread');
select public.send_message(pg_temp.id('about_enq'), 'Yes. Production now finishes on 28 Nov.');
select pg_temp.check(public.open_conversation('general', null, '00000000-0000-0000-0000-00000000000a') = pg_temp.id('general'),
  'staff can open a general chat with a customer');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select unread from public.list_conversations() where id = pg_temp.id('about_enq')) = 1,
  'the customer sees the staff reply as unread');
select pg_temp.check((select subject_number from public.list_conversations() where id = pg_temp.id('about_enq')) like 'ENQ-%',
  'the chat list shows the enquiry number');
reset role;

set local role anon;
select pg_temp.check(pg_temp.fails('select public.open_conversation()'), 'signed-out visitors can''t chat');
reset role;

rollback;

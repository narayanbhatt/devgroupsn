-- Chat between customers and DEV staff (design doc §25, §42). No notifications yet.
-- A conversation belongs to one customer and is either general or about one of their
-- enquiries or orders. Messages are text, a file, or both. Read status is per person.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  subject_type text not null default 'general' check (subject_type in ('general', 'enquiry', 'order')),
  subject_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((subject_type = 'general') = (subject_id is null))
);
-- One conversation per customer and subject.
create unique index conversations_subject_key
  on public.conversations (customer_id, subject_type, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'));
create index conversations_recent_idx on public.conversations (last_message_at desc nulls last);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id),
  body text check (body is null or length(body) between 1 and 4000),
  attachment_path text unique,
  attachment_name text check (attachment_name is null or length(attachment_name) between 1 and 200),
  attachment_mime text,
  attachment_size int check (attachment_size is null or attachment_size > 0),
  -- clock_timestamp so order and unread counts stay right within one transaction.
  created_at timestamptz not null default clock_timestamp(),
  check (body is not null or attachment_path is not null),
  check ((attachment_path is null) = (attachment_name is null))
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default clock_timestamp(),
  primary key (conversation_id, user_id)
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

-- The customer, members of the subject's organisation, and active staff.
create or replace function public.can_see_conversation(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations x
    where x.id = c and (
      x.customer_id = auth.uid()
      or public.is_staff()
      or (x.subject_type <> 'general' and public.can_see_owner(x.subject_type, x.subject_id))
    )
  );
$$;

-- Finds or starts the conversation for a subject. Customers open their own; staff can
-- open one about any enquiry or order, or a general one with a named customer.
create or replace function public.open_conversation(
  kind text default 'general', ref uuid default null, for_customer uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cust uuid;
  c uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to chat.' using errcode = '42501';
  end if;
  if kind = 'general' then
    if ref is not null then
      raise exception 'A general chat has no subject.' using errcode = '22023';
    end if;
    if for_customer is not null and for_customer <> auth.uid() then
      if not public.is_staff() then
        raise exception 'You can''t open that chat.' using errcode = '42501';
      end if;
      cust := for_customer;
    else
      cust := auth.uid();
    end if;
  elsif kind in ('enquiry', 'order') then
    if ref is null or not public.can_see_owner(kind, ref) then
      raise exception 'You can''t open that chat.' using errcode = '42501';
    end if;
    if kind = 'enquiry' then
      select e.customer_id into cust from public.enquiries e where e.id = ref;
    else
      select o.customer_id into cust from public.orders o where o.id = ref;
    end if;
  else
    raise exception 'Unknown chat subject.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = cust) then
    raise exception 'Customer not found.' using errcode = '22023';
  end if;

  insert into public.conversations (customer_id, subject_type, subject_id)
  values (cust, kind, ref)
  on conflict (customer_id, subject_type, coalesce(subject_id, '00000000-0000-0000-0000-000000000000')) do nothing
  returning id into c;
  if c is null then
    select x.id into c from public.conversations x
    where x.customer_id = cust and x.subject_type = kind and x.subject_id is not distinct from ref;
  end if;
  return c;
end $$;

create or replace function public.mark_conversation_read(c uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_see_conversation(c) then
    raise exception 'You can''t see this chat.' using errcode = '42501';
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (c, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end $$;

-- Sends a message. A file must already be uploaded to conversation/<id>/ in 'documents'.
create or replace function public.send_message(
  c uuid, body text default null, attachment_path text default null, attachment_name text default null,
  attachment_mime text default null, attachment_size int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  m uuid;
  b text := nullif(trim(body), '');
  preview text;
begin
  if not public.can_see_conversation(c) then
    raise exception 'You can''t send messages here.' using errcode = '42501';
  end if;
  if b is null and attachment_path is null then
    raise exception 'Write a message or attach a file.' using errcode = '22023';
  end if;
  if length(b) > 4000 then
    raise exception 'That message is too long. Keep it under 4,000 characters.' using errcode = '22023';
  end if;
  if attachment_path is not null then
    if attachment_path not like 'conversation/' || c || '/%' then
      raise exception 'The file is in the wrong place.' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = attachment_path) then
      raise exception 'Upload the file first.' using errcode = '22023';
    end if;
    if nullif(trim(attachment_name), '') is null then
      raise exception 'The file needs a name.' using errcode = '22023';
    end if;
  end if;

  insert into public.messages (conversation_id, body, attachment_path, attachment_name, attachment_mime, attachment_size)
  values (c, b, attachment_path, case when attachment_path is null then null else trim(attachment_name) end,
    attachment_mime, attachment_size)
  returning id into m;

  preview := coalesce(left(regexp_replace(b, '\s+', ' ', 'g'), 120), '📎 ' || trim(attachment_name));
  update public.conversations
     set last_message_at = clock_timestamp(), last_message_preview = preview, last_sender_id = auth.uid()
   where id = c;
  perform public.mark_conversation_read(c);
  return m;
end $$;

-- The chat list with who it's with, what it's about, and how many messages are unread.
create or replace function public.list_conversations()
returns table (
  id uuid, customer_id uuid, customer_name text, subject_type text, subject_id uuid, subject_number text,
  last_message_at timestamptz, last_message_preview text, last_sender_id uuid, unread int)
language sql stable security definer set search_path = '' as $$
  select x.id, x.customer_id, coalesce(nullif(p.full_name, ''), p.email), x.subject_type, x.subject_id,
    case x.subject_type
      when 'enquiry' then (select e.enquiry_number from public.enquiries e where e.id = x.subject_id)
      when 'order' then (select o.order_number from public.orders o where o.id = x.subject_id)
    end,
    x.last_message_at, x.last_message_preview, x.last_sender_id,
    (select count(*)::int from public.messages m
      where m.conversation_id = x.id and m.sender_id <> auth.uid()
        and m.created_at > coalesce((select r.last_read_at from public.conversation_reads r
                                     where r.conversation_id = x.id and r.user_id = auth.uid()), '-infinity'))
  from public.conversations x
  join public.profiles p on p.id = x.customer_id
  where public.can_see_conversation(x.id)
    and (x.last_message_at is not null or x.customer_id = auth.uid())
  order by x.last_message_at desc nulls last, x.created_at desc
  limit 300;
$$;

create policy conversations_select on public.conversations for select to authenticated
  using (public.can_see_conversation(id));
create policy messages_select on public.messages for select to authenticated
  using (public.can_see_conversation(conversation_id));
create policy conversation_reads_select on public.conversation_reads for select to authenticated
  using (user_id = auth.uid());
grant select on public.conversations, public.messages, public.conversation_reads to authenticated;

-- Chat files live in the private 'documents' bucket under conversation/<id>/<file>.
drop policy if exists documents_upload on storage.objects;
create policy documents_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$'
    and (
      (split_part(name, '/', 1) in ('enquiry', 'order')
        and public.can_see_owner(split_part(name, '/', 1), split_part(name, '/', 2)::uuid))
      or (split_part(name, '/', 1) = 'conversation'
        and public.can_see_conversation(split_part(name, '/', 2)::uuid))
    )
  );
drop policy if exists documents_read on storage.objects;
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
      or exists (
        select 1 from public.messages m
        where m.attachment_path = name and public.can_see_conversation(m.conversation_id)
      )
    )
  );

revoke execute on function public.can_see_conversation(uuid), public.open_conversation(text, uuid, uuid),
  public.mark_conversation_read(uuid), public.send_message(uuid, text, text, text, text, int),
  public.list_conversations()
  from public, anon;
grant execute on function public.can_see_conversation(uuid), public.open_conversation(text, uuid, uuid),
  public.mark_conversation_read(uuid), public.send_message(uuid, text, text, text, text, int),
  public.list_conversations()
  to authenticated;

-- New messages reach an open chat straight away (Supabase Realtime respects the RLS above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

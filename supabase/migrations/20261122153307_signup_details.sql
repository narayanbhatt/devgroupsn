-- Phase 1: keep the phone number and customer type entered at sign-up.
-- Values come from user metadata, which the person controls, so they are validated
-- here and anything unexpected falls back to safe defaults.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  ctype public.customer_type := 'individual';
  phone text := nullif(trim(meta ->> 'phone'), '');
begin
  if meta ->> 'customer_type' in ('individual', 'business', 'government', 'institution', 'contractor') then
    ctype := (meta ->> 'customer_type')::public.customer_type;
  end if;
  if phone is not null and length(phone) > 20 then
    phone := null;
  end if;
  insert into public.profiles (id, email, full_name, phone, customer_type)
  values (
    new.id,
    new.email,
    left(coalesce(meta ->> 'full_name', meta ->> 'name'), 200),
    phone,
    ctype
  );
  return new;
end $$;

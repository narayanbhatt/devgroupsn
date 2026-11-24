-- Short bullet points shown as "Key features" on the product page (as on devgroupsn.com).
-- Specifications stay as name/value pairs; key features are plain sentences.
alter table public.products add column key_features text[] not null default '{}';

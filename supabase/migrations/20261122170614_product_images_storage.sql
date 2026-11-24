-- Phase 2: storage for catalogue photos.
-- Product photos are public marketing images, so the bucket is public-read.
-- Only catalogue admins can upload, replace or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role('catalog_admin'));
create policy product_images_replace on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role('catalog_admin'))
  with check (bucket_id = 'product-images' and public.has_role('catalog_admin'));
create policy product_images_remove on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role('catalog_admin'));
-- Staff need to read object rows to replace or delete them.
create policy product_images_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.has_role('catalog_admin'));

-- Photos are shown in sort_order; the first is the hero image.
create index if not exists product_images_order_idx on public.product_images (product_id, sort_order);

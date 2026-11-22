-- Real DEV Group catalogue (design doc section 3). Prices are listed defaults only.
insert into public.categories (slug, name, sort_order) values
  ('furniture', 'Furniture', 1),
  ('sanitation', 'Sanitation', 2),
  ('lighting', 'Lighting', 3),
  ('solar', 'Solar', 4),
  ('utility', 'Utility', 5),
  ('services', 'Services', 6)
on conflict (slug) do nothing;

insert into public.products (sku, name, category_id, listed_price, tax_note, status)
select v.sku, v.name, c.id, v.price, v.tax_note, 'published'
from (values
  ('FUR-RCC-BENCH', 'RCC Bench', 'furniture', 2200, '+ Tax'),
  ('FUR-SCHOOL-BENCH', 'School Bench', 'furniture', 2200, '+ Tax'),
  ('SAN-DUSTBIN', 'Dustbin', 'sanitation', 900, '+ GST'),
  ('SAN-FOGGER', 'Fogging Machine', 'sanitation', 17600, '+ Tax'),
  ('LGT-STREET-45W', 'Street Light 45W', 'lighting', 750, '+ GST'),
  ('LGT-HIGHMAST', 'High Mast Complete Set', 'lighting', 29500, '+ Tax'),
  ('LGT-DESIGNER-POLE', 'Designer Pole', 'lighting', 4500, '+ Tax'),
  ('SOL-COMPLETE-SET', 'Solar Complete Set', 'solar', 5500, '+ Tax'),
  ('UTL-HAND-CART', 'Hand Cart / Thela', 'utility', 2800, '+ Tax'),
  ('UTL-GRASS-CUTTER', 'Grass Cutter Machine', 'utility', 7400, '+ Tax')
) as v (sku, name, slug, price, tax_note)
join public.categories c on c.slug = v.slug
on conflict (sku) do nothing;

insert into public.app_config (key, value) values
  ('quotation_defaults', '{"validity_days": 30, "gst_rate": 18, "terms": "Prices are valid until the date shown. Taxes as applicable."}')
on conflict (key) do nothing;

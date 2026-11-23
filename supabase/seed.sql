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

-- Descriptions, key features and photos from devgroupsn.com (product list as of 2026-11-23).
update public.products p
set description = v.description, key_features = v.features
from (values
  ('FUR-RCC-BENCH', 'Heavy-duty reinforced cement concrete bench for parks, gardens, railway stations and public spaces. Weather-resistant and maintenance-free with long service life.', array['Weather & UV resistant', 'Zero maintenance required', 'Long service life', 'Ideal for parks & public spaces', 'Heavy-duty RCC construction']),
  ('SAN-DUSTBIN', 'Durable metal dustbin for parks, commercial complexes and public areas. Sturdy construction with easy-clean design and multiple capacity options.', array['Durable material', 'Easy to clean', 'Weather resistant', 'Multiple sizes available', 'Rust-proof coating']),
  ('LGT-STREET-45W', '45-watt LED street light for roads, highways and public pathways. High lumen output with 50,000+ hour lifespan and IP65 weatherproof rating.', array['45W LED technology', '50,000+ hour lifespan', 'IP65 weatherproof', 'High lumen output', 'Energy efficient']),
  ('SOL-COMPLETE-SET', 'Complete solar street lighting kit including solar panel, LED fixture, battery and controller. Zero electricity cost with auto on/off sensor.', array['Full plug-and-play kit', 'Solar panel included', '2–3 night battery backup', 'Auto on/off sensor', 'Zero running cost']),
  ('LGT-HIGHMAST', 'Complete high mast lighting system for highways, stadiums, parking lots and large open areas. Multi-lamp fixture head with wide-area illumination.', array['Complete installation set', 'High-strength steel mast', 'Multi-lamp fixture', 'Wide area illumination', 'Easy maintenance access']),
  ('UTL-HAND-CART', 'Heavy-duty hand cart for transporting goods, waste collection and municipal works. Ergonomic design for easy maneuverability in narrow spaces.', array['Heavy-duty steel frame', 'High load capacity', 'Rust-resistant coating', 'Easy to clean', 'Ergonomic handles']),
  ('SAN-FOGGER', 'Professional thermal fogging machine for mosquito control, pest management and sanitization. Ideal for municipalities, hospitals and large-area disinfection.', array['High-capacity fuel tank', 'Long-range spray nozzle', 'Adjustable flow rate', 'Low maintenance', 'Easy to operate']),
  ('UTL-GRASS-CUTTER', 'Powerful brush cutter for maintaining parks, roadsides and green spaces. Easy-start engine with anti-vibration handle for comfortable operation.', array['High-power engine', 'Wide cutting width', 'Anti-vibration handle', 'Multiple blade options', 'Robust construction']),
  ('FUR-SCHOOL-BENCH', 'Durable steel school bench with desk for classrooms and educational institutions. Anti-corrosion finish with ergonomic seating design.', array['Ergonomic seating', 'Anti-corrosion finish', 'Durable steel frame', 'Multiple sizes available', 'Easy assembly']),
  ('LGT-DESIGNER-POLE', 'Aesthetically crafted decorative street and garden light pole. Enhances visual appeal of parks, promenades and urban spaces.', array['Premium aesthetic design', 'High-strength steel', 'Anti-corrosion coating', 'Multiple heights available', 'Custom designs possible'])
) as v (sku, description, features)
where p.sku = v.sku and p.description is null;

-- Photos are linked from the website until staff upload their own in the app.
insert into public.product_images (product_id, storage_path, alt, sort_order)
select p.id, v.url, v.alt, 0
from (values
  ('FUR-RCC-BENCH', 'https://devgroupsn.com/images/pro9.jpeg', 'RCC Bench'),
  ('SAN-DUSTBIN', 'https://devgroupsn.com/images/pro-dustbin.svg', 'Dustbin'),
  ('LGT-STREET-45W', 'https://devgroupsn.com/images/pro-streetlight.svg', 'Street Light 45W'),
  ('SOL-COMPLETE-SET', 'https://devgroupsn.com/images/pro4.jpeg', 'Solar Complete Set'),
  ('LGT-HIGHMAST', 'https://devgroupsn.com/images/pro5.jpeg', 'High Mast Complete Set'),
  ('UTL-HAND-CART', 'https://devgroupsn.com/images/pro6.jpeg', 'Hand Cart / Thela'),
  ('SAN-FOGGER', 'https://devgroupsn.com/images/pro2.jpeg', 'Fogging Machine'),
  ('UTL-GRASS-CUTTER', 'https://devgroupsn.com/images/pro7.jpeg', 'Grass Cutter Machine'),
  ('FUR-SCHOOL-BENCH', 'https://devgroupsn.com/images/pro8.jpeg', 'School Bench'),
  ('LGT-DESIGNER-POLE', 'https://devgroupsn.com/images/pro3.jpeg', 'Designer Pole')
) as v (sku, url, alt)
join public.products p on p.sku = v.sku
where not exists (select 1 from public.product_images i where i.product_id = p.id);

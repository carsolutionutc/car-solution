-- Marcas vendidas en México (AutoZone / retail) + columnas de consumo por pedido
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE inventory_usage_log
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES product_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen TEXT;

UPDATE inventory_items SET
  nombre = 'Armor All Ultra Shine Lavado y Encerado',
  descripcion = 'Shampoo con cera Armor All Ultra Shine — disponible en AutoZone México'
WHERE slug = 'shampoo';

UPDATE inventory_items SET
  nombre = 'Turtle Wax Super Hard Shell',
  descripcion = 'Cera en pasta Turtle Wax Super Hard Shell — AutoZone México'
WHERE slug = 'cera';

UPDATE inventory_items SET
  nombre = 'AutoZone Trapos de Microfibra',
  descripcion = 'Paquete de trapos de microfibra marca AutoZone'
WHERE slug = 'trapos';

UPDATE inventory_items SET
  nombre = 'Meguiar''s Ultimate Polish',
  descripcion = 'Polish Meguiar''s Ultimate — AutoZone y tiendas de detallado'
WHERE slug = 'polish';

UPDATE inventory_items SET
  nombre = 'Armor All Protectant Original',
  descripcion = 'Protector de interiores Armor All Original (conocido como Almorol)'
WHERE slug = 'almorol';

UPDATE inventory_items SET
  nombre = 'Little Trees Black Ice',
  descripcion = 'Aromatizante Little Trees aroma Black Ice'
WHERE slug = 'aromatizante';

UPDATE inventory_items SET
  nombre = 'Armor All Cepillo de Detalle',
  descripcion = 'Cepillo para detallado Armor All'
WHERE slug = 'cepillos';

UPDATE inventory_items SET
  nombre = 'Turtle Wax Bug & Tar Remover',
  descripcion = 'Removedor de insectos y alquitrán Turtle Wax (desengrasante)'
WHERE slug = 'desengrasante';

UPDATE inventory_items SET
  nombre = 'AutoZone Paños Microfibra Premium',
  descripcion = 'Paños de microfibra premium AutoZone'
WHERE slug = 'microfibra';

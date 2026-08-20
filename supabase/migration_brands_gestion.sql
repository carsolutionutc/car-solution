-- Marcas comerciales + tracking de consumo por pedido
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE inventory_usage_log
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES product_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen TEXT;

-- Nombres con marca específica (México / detallado automotriz)
UPDATE inventory_items SET
  nombre = 'Meguiar''s Gold Class Car Wash',
  descripcion = 'Shampoo automotriz Meguiar''s Gold Class — botella 500 ml para lavado suave con brillo'
WHERE slug = 'shampoo';

UPDATE inventory_items SET
  nombre = 'Meguiar''s Ultimate Liquid Wax',
  descripcion = 'Cera líquida Meguiar''s Ultimate — protección y brillo (250 ml)'
WHERE slug = 'cera';

UPDATE inventory_items SET
  nombre = 'Chemical Guys Soft Microfiber Towels',
  descripcion = 'Paquete de 5 trapos de microfibra Chemical Guys'
WHERE slug = 'trapos';

UPDATE inventory_items SET
  nombre = 'Meguiar''s Ultimate Polish',
  descripcion = 'Polish Meguiar''s Ultimate — corrección ligera y brillo (200 ml)'
WHERE slug = 'polish';

UPDATE inventory_items SET
  nombre = 'Armor All Protectant Original',
  descripcion = 'Protector Armor All (Almorol) para plásticos e interiores (200 ml)'
WHERE slug = 'almorol';

UPDATE inventory_items SET
  nombre = 'Little Trees Black Ice',
  descripcion = 'Aromatizante Little Trees Black Ice — 1 pieza'
WHERE slug = 'aromatizante';

UPDATE inventory_items SET
  nombre = 'Chemical Guys Soft Grip Brush',
  descripcion = 'Cepillo de detalle Chemical Guys Soft Grip — 1 pza'
WHERE slug = 'cepillos';

UPDATE inventory_items SET
  nombre = 'Marflo Max Force Degreaser',
  descripcion = 'Desengrasante Marflo Max Force — botella 500 ml'
WHERE slug = 'desengrasante';

UPDATE inventory_items SET
  nombre = 'The Rag Company Eagle Edgeless',
  descripcion = 'Paquete de 3 paños microfibra The Rag Company Eagle Edgeless'
WHERE slug = 'microfibra';

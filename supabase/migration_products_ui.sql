-- Productos: categoría + imagen + textos
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS imagen TEXT;

-- Categorías: lavado | proteccion | interiores | limpieza | accesorios
UPDATE inventory_items SET
  categoria = 'lavado',
  imagen = 'products/armor-all-ultra-shine.jpg',
  descripcion = 'Shampoo con cera Armor All Ultra Shine. Lava, abrillanta y protege en un solo paso. Ideal para uso semanal.'
WHERE slug = 'shampoo';

UPDATE inventory_items SET
  categoria = 'proteccion',
  imagen = 'products/turtle-wax-super-hard-shell.jpg',
  descripcion = 'Cera en pasta Turtle Wax Super Hard Shell. Brillo intenso y capa protectora de larga duración.'
WHERE slug = 'cera';

UPDATE inventory_items SET
  categoria = 'accesorios',
  imagen = 'products/autozone-trapos-microfibra.jpg',
  descripcion = 'Paquete de trapos de microfibra AutoZone. Suaves, absorbentes y seguros para pintura.'
WHERE slug = 'trapos';

UPDATE inventory_items SET
  categoria = 'proteccion',
  imagen = 'products/meguiars-ultimate-polish.jpg',
  descripcion = 'Polish Meguiar''s Ultimate. Corrige micro-rayones ligeros y realza el brillo de la carrocería.'
WHERE slug = 'polish';

UPDATE inventory_items SET
  categoria = 'interiores',
  imagen = 'products/armor-all-protectant.jpg',
  descripcion = 'Armor All Protectant Original. Protege e hidrata plásticos, tablero y vinil del habitáculo.'
WHERE slug = 'almorol';

UPDATE inventory_items SET
  categoria = 'interiores',
  imagen = 'products/little-trees-black-ice.jpg',
  descripcion = 'Aromatizante Little Trees Black Ice. Aroma fresco y duradero para el interior del vehículo.'
WHERE slug = 'aromatizante';

UPDATE inventory_items SET
  categoria = 'accesorios',
  imagen = 'products/armor-all-cepillo-detalle.jpg',
  descripcion = 'Cepillo de detalle Armor All. Ideal para rines, ranuras y zonas difíciles de alcanzar.'
WHERE slug = 'cepillos';

UPDATE inventory_items SET
  categoria = 'limpieza',
  imagen = 'products/turtle-wax-bug-tar.jpg',
  descripcion = 'Turtle Wax Bug & Tar Remover. Elimina insectos, alquitrán y residuos difíciles sin dañar la pintura.'
WHERE slug = 'desengrasante';

UPDATE inventory_items SET
  categoria = 'accesorios',
  imagen = 'products/autozone-panos-microfibra.jpg',
  descripcion = 'Paños de microfibra premium AutoZone. Perfectos para secado y acabado sin pelusa.'
WHERE slug = 'microfibra';

-- Migración: clientes Google, productos vendibles, pedidos
-- Ejecutar en Supabase → SQL Editor

-- ── Clientes (Google) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub   TEXT UNIQUE NOT NULL,
  email        TEXT NOT NULL,
  nombre       TEXT NOT NULL DEFAULT '',
  foto_url     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Vincular citas a cliente (opcional)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);

-- ── Productos vendibles (sobre inventario) ─────────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS precio NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS descripcion TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pack_cantidad NUMERIC(12,2) NOT NULL DEFAULT 1;

-- pack_cantidad = unidades de stock que se descuentan por cada "unidad" comprada
-- Ej. shampoo: pack 500 ml → al comprar 1 botella se descuentan 500 del stock

UPDATE inventory_items SET
  precio = 80, pack_cantidad = 500,
  nombre = 'Meguiar''s Gold Class Car Wash',
  descripcion = 'Shampoo automotriz Meguiar''s Gold Class — botella 500 ml'
  WHERE slug = 'shampoo';
UPDATE inventory_items SET
  precio = 120, pack_cantidad = 250,
  nombre = 'Meguiar''s Ultimate Liquid Wax',
  descripcion = 'Cera líquida Meguiar''s Ultimate (250 ml)'
  WHERE slug = 'cera';
UPDATE inventory_items SET
  precio = 45, pack_cantidad = 5, unidad = 'pzas',
  nombre = 'Chemical Guys Soft Microfiber Towels',
  descripcion = 'Paquete de 5 trapos Chemical Guys'
  WHERE slug = 'trapos';
UPDATE inventory_items SET
  precio = 150, pack_cantidad = 200,
  nombre = 'Meguiar''s Ultimate Polish',
  descripcion = 'Polish Meguiar''s Ultimate (200 ml)'
  WHERE slug = 'polish';
UPDATE inventory_items SET
  precio = 90, pack_cantidad = 200,
  nombre = 'Armor All Protectant Original',
  descripcion = 'Protector Armor All / Almorol para interiores (200 ml)'
  WHERE slug = 'almorol';
UPDATE inventory_items SET
  precio = 35, pack_cantidad = 1,
  nombre = 'Little Trees Black Ice',
  descripcion = 'Aromatizante Little Trees Black Ice (1 pza)'
  WHERE slug = 'aromatizante';
UPDATE inventory_items SET
  precio = 60, pack_cantidad = 1,
  nombre = 'Chemical Guys Soft Grip Brush',
  descripcion = 'Cepillo de detalle Chemical Guys (1 pza)'
  WHERE slug = 'cepillos';
UPDATE inventory_items SET
  precio = 70, pack_cantidad = 500,
  nombre = 'Marflo Max Force Degreaser',
  descripcion = 'Desengrasante Marflo Max Force (500 ml)'
  WHERE slug = 'desengrasante';
UPDATE inventory_items SET
  precio = 55, pack_cantidad = 3,
  nombre = 'The Rag Company Eagle Edgeless',
  descripcion = 'Paquete de 3 paños The Rag Company'
  WHERE slug = 'microfibra';

-- ── Pedidos de productos ───────────────────────────────────
CREATE TABLE IF NOT EXISTS product_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio         TEXT UNIQUE NOT NULL,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL,
  total         NUMERIC(10,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'entregado', 'cancelada')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES product_orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  nombre          TEXT NOT NULL,
  cantidad        NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  pack_cantidad   NUMERIC(12,2) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(10,2) NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_orders_customer ON product_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_status ON product_orders(status);
CREATE INDEX IF NOT EXISTS idx_product_orders_folio ON product_orders(folio);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_order_items ENABLE ROW LEVEL SECURITY;

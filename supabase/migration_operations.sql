-- Migración: operaciones (duración, bays, QR check-in, inventario)
-- Ejecutar en Supabase → SQL Editor

-- ── Servicios: duración estimada ───────────────────────────
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30;

UPDATE services SET duration_minutes = 25  WHERE slug = 'basico-express';
UPDATE services SET duration_minutes = 30  WHERE slug = 'basico-interior';
UPDATE services SET duration_minutes = 45  WHERE slug = 'intermedio';
UPDATE services SET duration_minutes = 50  WHERE slug = 'premium';
UPDATE services SET duration_minutes = 45  WHERE slug = 'suv-camioneta';
UPDATE services SET duration_minutes = 180 WHERE slug = 'detallado-simple';
UPDATE services SET duration_minutes = 200 WHERE slug = 'detallado-premium';
UPDATE services SET duration_minutes = 210 WHERE slug = 'detallado-diamante';
UPDATE services SET duration_minutes = 40  WHERE slug = 'restauracion-faros';
UPDATE services SET duration_minutes = 45  WHERE slug = 'hidratacion-piel';

-- ── Bookings: bahía y check-in QR ──────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS bay_number INTEGER CHECK (bay_number IS NULL OR (bay_number BETWEEN 1 AND 4)),
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- ── Inventario ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  nombre     TEXT NOT NULL,
  unidad     TEXT NOT NULL DEFAULT 'ml',
  stock_teorico NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_materials (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  cantidad   NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  UNIQUE (service_id, item_id)
);

CREATE TABLE IF NOT EXISTS inventory_audits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT
);

CREATE TABLE IF NOT EXISTS inventory_audit_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id          UUID NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id),
  stock_teorico     NUMERIC(12,2) NOT NULL,
  cantidad_medida   NUMERIC(12,2) NOT NULL,
  diferencia        NUMERIC(12,2) NOT NULL,
  UNIQUE (audit_id, item_id)
);

CREATE TABLE IF NOT EXISTS inventory_usage_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  item_id     UUID NOT NULL REFERENCES inventory_items(id),
  cantidad    NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_fecha_hora ON bookings(fecha, hora);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_created ON inventory_usage_log(created_at);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_usage_log ENABLE ROW LEVEL SECURITY;

-- ── Seed materiales ────────────────────────────────────────
INSERT INTO inventory_items (slug, nombre, unidad, stock_teorico) VALUES
  ('cera',          'Cera',          'ml',   2000),
  ('shampoo',       'Shampoo',       'ml',   5000),
  ('trapos',        'Trapos',        'pzas', 50),
  ('polish',        'Polish',        'ml',   1500),
  ('almorol',       'Almorol',       'ml',   1000),
  ('aromatizante',  'Aromatizante',  'pzas', 40),
  ('cepillos',      'Cepillos',      'pzas', 20),
  ('desengrasante', 'Desengrasante', 'ml',   3000),
  ('microfibra',    'Paños microfibra', 'pzas', 30)
ON CONFLICT (slug) DO NOTHING;

-- ── Consumo esperado por servicio (vía slugs) ──────────────
DO $$
DECLARE
  sid UUID;
  iid UUID;
BEGIN
  -- Helper pattern: for each service slug, insert materials

  -- Básico Express
  SELECT id INTO sid FROM services WHERE slug = 'basico-express';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 50)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 20)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Básico Interior
  SELECT id INTO sid FROM services WHERE slug = 'basico-interior';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 40)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cepillos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Intermedio
  SELECT id INTO sid FROM services WHERE slug = 'intermedio';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 80)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cera';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 30)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cepillos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 30)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Premium
  SELECT id INTO sid FROM services WHERE slug = 'premium';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 100)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cera';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 40)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 3)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cepillos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 40)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- SUV / Camioneta
  SELECT id INTO sid FROM services WHERE slug = 'suv-camioneta';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 90)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 35)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Detallado Simple
  SELECT id INTO sid FROM services WHERE slug = 'detallado-simple';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 150)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cera';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 60)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'polish';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 40)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'almorol';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 30)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 4)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cepillos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 60)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'aromatizante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 4)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Detallado Premium
  SELECT id INTO sid FROM services WHERE slug = 'detallado-premium';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 180)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cera';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 80)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'polish';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 60)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'almorol';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 40)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 5)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cepillos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 80)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'aromatizante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 5)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Detallado Diamante
  SELECT id INTO sid FROM services WHERE slug = 'detallado-diamante';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'shampoo';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 200)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cera';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 100)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'polish';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 80)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'almorol';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 50)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 6)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'cepillos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 3)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'desengrasante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 100)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'aromatizante';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 6)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Restauración de Faros
  SELECT id INTO sid FROM services WHERE slug = 'restauracion-faros';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'polish';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 35)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;

  -- Hidratación de Piel
  SELECT id INTO sid FROM services WHERE slug = 'hidratacion-piel';
  IF sid IS NOT NULL THEN
    SELECT id INTO iid FROM inventory_items WHERE slug = 'almorol';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 45)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'microfibra';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 2)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
    SELECT id INTO iid FROM inventory_items WHERE slug = 'trapos';
    INSERT INTO service_materials (service_id, item_id, cantidad) VALUES (sid, iid, 1)
      ON CONFLICT (service_id, item_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  END IF;
END $$;

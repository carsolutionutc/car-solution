-- Ejecutar en Supabase → SQL Editor
-- Plataforma Detallado Automotriz

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Servicios ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  categoria   TEXT NOT NULL CHECK (categoria IN ('basico', 'detallado', 'especial')),
  nombre      TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio_base NUMERIC(10,2) NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]',
  popular     BOOLEAN NOT NULL DEFAULT false,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Extras ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  nombre     TEXT NOT NULL,
  precio     NUMERIC(10,2) NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Citas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           TEXT UNIQUE NOT NULL,
  nombre          TEXT NOT NULL,
  email           TEXT NOT NULL,
  telefono        TEXT NOT NULL,
  service_id      UUID NOT NULL REFERENCES services(id),
  vehiculo_tipo   TEXT NOT NULL DEFAULT 'Auto / Sedan',
  vehiculo_extra  NUMERIC(10,2) NOT NULL DEFAULT 0,
  tapiceria       TEXT NOT NULL DEFAULT 'Tela',
  tapiceria_extra NUMERIC(10,2) NOT NULL DEFAULT 0,
  fecha           DATE NOT NULL,
  hora            TIME NOT NULL,
  total           NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (status IN ('pendiente', 'confirmada', 'completada', 'cancelada')),
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS booking_extras (
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  extra_id   UUID NOT NULL REFERENCES extras(id),
  precio     NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (booking_id, extra_id)
);

-- ── Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_fecha ON bookings(fecha);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);

-- ── Trigger updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_updated ON bookings;
CREATE TRIGGER trg_bookings_updated
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Seed: servicios ────────────────────────────────────────
INSERT INTO services (slug, categoria, nombre, descripcion, precio_base, items, popular) VALUES
  ('basico-express',       'basico',    'Básico Express',       'Lavado exterior completo con secado a mano y limpieza de cristales.',   150,  '["Lavado exterior","Secado a mano","Cristales"]', false),
  ('basico-interior',      'basico',    'Básico Interior',      'Lavado exterior con aspirado profundo del habitáculo.',                 120,  '["Lavado exterior","Aspirado interior","Tablero"]', false),
  ('intermedio',           'basico',    'Intermedio',           'Servicio completo con brillo de llantas y encerado de carrocería.',    200,  '["Lavado + aspirado","Brillo llantas","Cera protectora"]', true),
  ('premium',              'basico',    'Premium',              'Lavado completo incluyendo tolvas y cajuela.',                         230,  '["Lavado completo","Tolvas y cajuela","Acondicionado"]', false),
  ('suv-camioneta',        'basico',    'SUV / Camioneta',      'Lavado exterior completo adaptado para vehículos grandes.',            220,  '["Lavado XL","Secado a mano","Cristales completos"]', false),
  ('detallado-simple',     'detallado', 'Detallado Simple',     'Limpieza profunda y sanitización completa del vehículo.',              2100, '["Limpieza profunda","Sanitización","Ozono interior"]', false),
  ('detallado-premium',    'detallado', 'Detallado Premium',    'Detallado profesional con lavado de motor incluido.',                  3000, '["Todo el Simple","Lavado de motor","Pulido carrocería"]', true),
  ('detallado-diamante',   'detallado', 'Detallado Diamante',   'El servicio más completo con encerado profesional de larga duración.', 3500, '["Todo el Premium","Encerado profesional","Protección"]', false),
  ('restauracion-faros',   'especial',  'Restauración de Faros','Pulido y restauración de faros opacos o amarillentos.',               250,  '["Pulido profundo","Sellador aplicado","Claridad garantizada"]', false),
  ('hidratacion-piel',     'especial',  'Hidratación de Piel',  'Tratamiento especial para tapicería de piel o cuero.',                450,  '["Limpieza suave","Hidratante premium","Protección UV"]', false)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed: extras ─────────────────────────────────────────
INSERT INTO extras (slug, nombre, precio) VALUES
  ('arom',  'Aromatizante',   50),
  ('llan',  'Brillo llantas', 80),
  ('motor', 'Lav. motor',     200),
  ('faros', 'Rest. faros',    250),
  ('sella', 'Sellado',        350),
  ('ozon',  'Ozono',          150)
ON CONFLICT (slug) DO NOTHING;

-- ── RLS (backend usa service_role; desactivar acceso público directo) ──
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_extras ENABLE ROW LEVEL SECURITY;

-- Sin políticas = solo service_role puede acceder (vía backend)

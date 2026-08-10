-- Ejecutar en Supabase SQL Editor si ya tenías la BD creada
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

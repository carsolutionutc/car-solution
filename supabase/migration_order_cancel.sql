-- Motivo de cancelación en pedidos de productos
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

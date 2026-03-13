-- ============================================================
-- Migration 009 — SMS notification opt-in fields on profiles
-- Run in Supabase SQL Editor
-- ============================================================

-- Phone number (E.164 format, e.g. +12125551234) and SMS opt-in flag.
-- sms_opt_in defaults to FALSE so users must explicitly enable it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

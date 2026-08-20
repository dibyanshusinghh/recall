/**
 * Migration 001 — Preliminary check: public.users type assertion
 *
 * This migration does NOT create any tables. It verifies that the Notify
 * service's `public.users` table exists and has an `id` column before we
 * attempt to create recall.* tables that reference it.
 *
 * ASSUMPTION: public.users.id is of type UUID.
 * To verify:
 *   SELECT column_name, data_type
 *   FROM information_schema.columns
 *   WHERE table_schema = 'public'
 *     AND table_name   = 'users'
 *     AND column_name  = 'id';
 *
 * If the type turns out to be BIGINT / SERIAL / etc., update every
 * FK column in migration 002 from UUID to the correct type before running.
 *
 * Safe to run multiple times (no-op on re-run).
 */
'use strict';

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      col_type TEXT;
    BEGIN
      -- Guard: public.users table must exist (provided by Notify service)
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) THEN
        RAISE EXCEPTION
          'public.users does not exist. Recall requires the Notify service''s '
          'public.users table to be present before running these migrations.';
      END IF;

      -- Guard: public.users must have an id column
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'users'
          AND column_name  = 'id'
      ) THEN
        RAISE EXCEPTION
          'public.users.id column not found. '
          'Recall FK columns assume public.users(id) exists.';
      END IF;

      -- Informational: log the actual type so operators can verify the UUID assumption
      SELECT data_type INTO col_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'users'
        AND column_name  = 'id';

      RAISE NOTICE 'public.users.id data_type = %. Recall assumes UUID — verify this matches.', col_type;
    END $$;
  `);
};

// Nothing to undo — this migration only performs assertions.
exports.down = (_pgm) => {};

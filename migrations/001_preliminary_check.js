/**
 * Migration 001 — Create the recall schema.
 *
 * Recall owns its own userbase in recall.users (created in migration 002).
 * This step only ensures the schema exists before tables are created.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */
'use strict';

exports.up = (pgm) => {
  pgm.sql(`CREATE SCHEMA IF NOT EXISTS recall;`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS recall CASCADE;`);
};

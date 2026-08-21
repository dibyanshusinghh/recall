/**
 * Migration 004 — add recall.users.role
 *
 * Column is stored only. No application logic reads or writes it;
 * inserts rely on the DEFAULT ('CLIENT').
 *
 * Safe if 002/003 already created recall.users without this column.
 */
'use strict';

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS recall.users
      ADD COLUMN IF NOT EXISTS role VARCHAR(255) NOT NULL DEFAULT 'CLIENT';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS recall.users
      DROP COLUMN IF EXISTS role;
  `);
};

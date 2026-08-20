'use strict';
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Set search_path on every new connection so Recall queries can reference
// `meetings`, `user_profiles`, etc. without the `recall.` prefix, while
// still resolving `public.users` from the Notify service.
pool.on('connect', (client) => {
  client.query("SET search_path TO recall, public");
});

pool.on('error', (err) => {
  // Emitted for idle clients that encounter an error. Log and continue.
  console.error('[DB] Unexpected idle client error:', err.message);
});

/**
 * Run a query on a pool-acquired client.
 * @param {string} text - SQL statement
 * @param {any[]} [params] - Query parameters
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a dedicated client for manual transaction management.
 * Caller is responsible for calling client.release().
 */
async function getClient() {
  return pool.connect();
}

/**
 * Execute a function inside a BEGIN/COMMIT transaction.
 * Automatically rolls back on error and re-throws.
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Verify the pool can reach the database. Used at startup. */
async function connectDb() {
  const client = await pool.connect();
  client.release();
}

module.exports = { query, getClient, transaction, connectDb, pool };

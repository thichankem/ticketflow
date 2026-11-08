import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ensure environment variables are loaded regardless of invocation origin
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current process working directory if any

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

// Supabase SSL handling:
// Supabase requires SSL encryption. Local Docker/dev (e.g. localhost/pgsql) typically does not.
const requiresSsl =
  process.env.DB_SSL === 'true' ||
  (connectionString &&
    (connectionString.includes('sslmode=require') ||
      connectionString.includes('supabase.co') ||
      connectionString.includes('supabase.com'))) ||
  (isProduction && process.env.DB_SSL !== 'false');

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || (isProduction ? '5' : '10'), 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'backend',
      user: process.env.DB_USERNAME || process.env.DB_USER || 'username',
      password: process.env.DB_PASSWORD || 'password',
      ssl: requiresSsl ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || (isProduction ? '5' : '10'), 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
    };

export const pool = new Pool(poolConfig);

// Catch unexpected errors on idle pool clients to prevent process crash
pool.on('error', (err) => {
  console.error('[Database Pool Error] Unexpected error on idle client:', err.message);
});

/**
 * Custom error thrown when ticket inventory cannot satisfy the reservation request.
 * Carries HTTP status 409 Conflict.
 */
export class InventoryExhaustedError extends Error {
  constructor(tierId, requested, remaining = 0) {
    super(`Ticket tier ${tierId} has insufficient inventory (requested: ${requested}, remaining: ${remaining})`);
    this.name = 'InventoryExhaustedError';
    this.code = 'INVENTORY_EXHAUSTED';
    this.statusCode = 409;
    this.tierId = tierId;
    this.requested = requested;
    this.remaining = remaining;
  }
}

/**
 * Primary database query helper.
 * Executes parameterized SQL queries on the pool.
 *
 * SUPABASE PGBOUNCER COMPATIBILITY:
 * Explicitly strips the `name` property to ensure the extended query protocol executes
 * anonymous prepared statements (Parse ""), strictly avoiding "prepared statement does not exist"
 * errors in transaction pooling mode.
 *
 * @param {string|object} text - SQL query string or query config object
 * @param {Array} [params] - Parameterized values ($1, $2, ...)
 * @returns {Promise<{ rows: Array<any>, rowCount: number, fields: Array<any> }>}
 */
export const query = async (text, params) => {
  let queryConfig;
  if (typeof text === 'string') {
    queryConfig = { text, values: params };
  } else if (text && typeof text === 'object') {
    queryConfig = { ...text };
    if (params) queryConfig.values = params;
  } else {
    throw new TypeError('Invalid query parameter: text must be a string or query object');
  }

  // Strictly avoid named prepared statements for PgBouncer transaction mode
  delete queryConfig.name;

  return pool.query(queryConfig);
};

/**
 * Checks out a dedicated client from the pool for multi-statement atomic transactions.
 * Automatically wraps client.query to strip `name` parameters.
 * The caller is responsible for invoking client.release() when finished.
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
export const getClient = async () => {
  const client = await pool.connect();

  if (!client._originalQuery) {
    client._originalQuery = client.query;
  }

  client.query = function (text, values, cb) {
    const callback = typeof values === 'function' ? values : cb;
    const params = typeof values === 'function' ? undefined : values;

    let queryConfig;
    if (typeof text === 'string') {
      queryConfig = params !== undefined ? { text, values: params } : text;
    } else if (text && typeof text === 'object') {
      queryConfig = { ...text };
      if (params !== undefined) queryConfig.values = params;
    } else {
      return client._originalQuery.apply(this, arguments);
    }

    if (queryConfig && typeof queryConfig === 'object') {
      delete queryConfig.name;
    }

    if (typeof callback === 'function') {
      return client._originalQuery.call(this, queryConfig, callback);
    }
    return client._originalQuery.call(this, queryConfig);
  };

  return client;
};

/**
 * High-level atomic transaction wrapper.
 * Manages checkout, BEGIN, COMMIT, ROLLBACK, and client release.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export const withTransaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Database Transaction Error] Rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Atomically reserves ticket quantities across multiple tiers within an active transaction.
 *
 * Anti-Overbooking Mechanism:
 * Uses `UPDATE ticket_tiers SET remaining_quantity = remaining_quantity - $1 WHERE id = $2 AND remaining_quantity >= $1 RETURNING id, remaining_quantity;`
 * If remaining_quantity < quantity, rowCount === 0 and an InventoryExhaustedError (409) is thrown.
 *
 * Deadlock Prevention:
 * Cart items are sorted by ticket_tier_id ascending before acquiring row locks, ensuring
 * uniform global lock acquisition order across concurrent checkout requests.
 *
 * @param {import('pg').PoolClient} client - Dedicated PostgreSQL client in an active transaction
 * @param {Array<{ ticket_tier_id: number|string, quantity: number }>} items - Cart items to reserve
 * @returns {Promise<Array<{ id: number|string, remaining_quantity: number }>>} Updated tier rows
 * @throws {InventoryExhaustedError} When any tier cannot satisfy the requested quantity
 */
export const reserveTickets = async (client, items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  // Sort items by ticket_tier_id ascending to prevent database deadlocks
  const sortedItems = [...items].sort((a, b) => {
    const idA = Number(a.ticket_tier_id);
    const idB = Number(b.ticket_tier_id);
    if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
    return String(a.ticket_tier_id).localeCompare(String(b.ticket_tier_id));
  });

  const reservedTiers = [];

  for (const item of sortedItems) {
    const quantity = parseInt(item.quantity, 10);
    const tierId = item.ticket_tier_id;

    if (isNaN(quantity) || quantity <= 0) {
      continue;
    }

    const updateSql = `
      UPDATE ticket_tiers
      SET remaining_quantity = remaining_quantity - $1
      WHERE id = $2 AND remaining_quantity >= $1
      RETURNING id, remaining_quantity;
    `;

    const result = await client.query(updateSql, [quantity, tierId]);

    if (result.rowCount === 0) {
      // Diagnostic lookup: fetch current remaining quantity for clear error reporting
      const checkSql = 'SELECT remaining_quantity FROM ticket_tiers WHERE id = $1';
      const checkResult = await client.query(checkSql, [tierId]);
      const currentRemaining = checkResult.rowCount > 0 ? checkResult.rows[0].remaining_quantity : 0;

      throw new InventoryExhaustedError(tierId, quantity, currentRemaining);
    }

    reservedTiers.push(result.rows[0]);
  }

  return reservedTiers;
};

/**
 * Restores remaining_quantity for ticket tiers when an order or cart reservation expires/cancels.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} client - Database client or pool
 * @param {Array<{ ticket_tier_id: number|string, quantity: number }>} items - Cart items to restore
 * @returns {Promise<Array<{ id: number|string, remaining_quantity: number }>>}
 */
export const releaseTickets = async (client, items) => {
  const dbClient = client || pool;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const releasedTiers = [];

  for (const item of items) {
    const quantity = parseInt(item.quantity, 10);
    const tierId = item.ticket_tier_id;

    if (isNaN(quantity) || quantity <= 0) {
      continue;
    }

    const restoreSql = `
      UPDATE ticket_tiers
      SET remaining_quantity = remaining_quantity + $1
      WHERE id = $2
      RETURNING id, remaining_quantity;
    `;

    const result = await dbClient.query(restoreSql, [quantity, tierId]);
    if (result.rowCount > 0) {
      releasedTiers.push(result.rows[0]);
    }
  }

  return releasedTiers;
};

/**
 * Closes all connections in the pool. Used for test teardown and graceful shutdown.
 */
export const closePool = async () => {
  await pool.end();
};

export default {
  pool,
  query,
  getClient,
  withTransaction,
  reserveTickets,
  releaseTickets,
  InventoryExhaustedError,
  closePool,
};

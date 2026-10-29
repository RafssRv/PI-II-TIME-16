// Autor: Vinicius Panutti Salgado — R.A. 25007329
const mysql = require('mysql2/promise');

function createMysqlDatabase({ driver = mysql, env = process.env } = {}) {
  const pool = driver.createPool({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE || 'demandas_app',
    connectionLimit: 5,
    waitForConnections: true,
    namedPlaceholders: true,
    charset: 'utf8mb4',
    dateStrings: ['DATE'],
    timezone: 'Z',
    multipleStatements: false
  });

  async function connection() {
    const conn = await pool.getConnection();
    try {
      await conn.query("SET time_zone = '+00:00'");
      await conn.beginTransaction();
    } catch (error) {
      conn.release();
      throw error;
    }
    return {
      async query(sql, binds = {}) {
        const [rows] = await conn.execute(sql, binds);
        return rows;
      },
      async execute(sql, binds = {}) {
        const [result] = await conn.execute(sql, binds);
        return result;
      },
      commit: () => conn.commit(),
      rollback: () => conn.rollback(),
      async close() {
        // Nunca devolva ao pool uma transação aberta, inclusive em leituras/erros.
        try { await conn.rollback(); } finally { conn.release(); }
      }
    };
  }

  return {
    connection,
    close: () => pool.end()
  };
}

module.exports = { createMysqlDatabase };

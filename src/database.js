const oracledb = require('oracledb');

function lowerCaseRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
}

function createOracleDatabase() {
  let pool;
  async function getPool() {
    pool ||= await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1',
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1
    });
    return pool;
  }

  async function connection() {
    const conn = await (await getPool()).getConnection();
    return {
      async query(sql, binds = {}) {
        const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return (result.rows || []).map(lowerCaseRow);
      },
      execute: (sql, binds = {}) => conn.execute(sql, binds, { autoCommit: false }),
      commit: () => conn.commit(),
      rollback: () => conn.rollback(),
      close: () => conn.close()
    };
  }

  return {
    connection,
    async close() { if (pool) await pool.close(10); }
  };
}

module.exports = { createOracleDatabase };

/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (persistência dos dados)

Descrição: 
Configura e gerencia as conexões com o MySQL usando as variáveis de ambiente. Oferece funções de consulta e gravação,
com controle de transações por commit e rollback, além de liberar as conexões para reutilização após o uso
*/
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
      async query(sql: string, binds: any = {}) {
        const [rows] = await conn.execute(sql, binds);
        return rows;
      },
      async execute(sql: string, binds: any = {}) {
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

export { createMysqlDatabase };

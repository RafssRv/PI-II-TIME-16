/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (persistência dos dados)

Descrição: 
Configura e gerencia as conexões com o MySQL usando as variáveis de ambiente. Oferece funções de consulta e gravação,
com controle de transações por commit e rollback, além de liberar as conexões para reutilização após o uso
*/

// Importa o cliente usado para conversar com o banco MySQL
const mysql = require('mysql2/promise');

// Cria o objeto responsável pelas conexões e transações do banco
function createMysqlDatabase({ driver = mysql, env = process.env } = {}) {

  // Cria um conjunto limitado de conexões que podem ser reutilizadas
  const pool = driver.createPool({

    // Usa as configurações do ambiente ou valores locais padrão
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

  // Abre uma conexão e inicia uma transação
  async function connection() {

    // Obtém uma conexão disponível no conjunto
    const conn = await pool.getConnection();

    try {
      // Define o horário da conexão como UTC
      await conn.query("SET time_zone = '+00:00'");

      // Inicia uma transação antes das operações SQL
      await conn.beginTransaction();
    } catch (error) {
      // Devolve a conexão ao conjunto se a transação não puder iniciar
      conn.release();
      throw error;
    }

    // Expõe somente as operações necessárias pelas rotas
    return {

      // Executa uma consulta e devolve as linhas encontradas
      async query(sql: string, binds: any = {}) {
        const [rows] = await conn.execute(sql, binds);
        return rows;
      },

      // Executa uma gravação ou alteração e devolve o resultado
      async execute(sql: string, binds: any = {}) {
        const [result] = await conn.execute(sql, binds);
        return result;
      },

      // Confirma todas as alterações da transação
      commit: () => conn.commit(),

      // Cancela todas as alterações da transação
      rollback: () => conn.rollback(),
      
      // Encerra a transação e devolve a conexão ao conjunto
      async close() {
        // Cancela qualquer alteração pendente antes de liberar a conexão
        try { await conn.rollback(); } finally { conn.release(); }
      }
    };
  }

  // Disponibiliza conexão e encerramento completo do conjunto
  return {
    connection,
    // Fecha todas as conexões abertas pelo pool
    close: () => pool.end()
  };
}

// Exporta a função usada pelo servidor para criar o banco
export { createMysqlDatabase };

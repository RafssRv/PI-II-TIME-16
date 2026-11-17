// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
// Importa a interface assíncrona do mysql2, cujas consultas devolvem Promises.
const mysql = require('mysql2/promise');

// Permite injetar driver e ambiente nos testes; em execução normal usa mysql2 e process.env.
function createMysqlDatabase({ driver = mysql, env = process.env } = {}) {
  // Cria um pool reutilizável; as conexões físicas são obtidas quando connection() é chamada.
  const pool = driver.createPool({
    // Usa o host configurado ou o endereço de loopback quando não informado.
    host: env.MYSQL_HOST || '127.0.0.1',
    // Converte a porta do ambiente, que é texto, para número; o padrão é 3306.
    port: Number(env.MYSQL_PORT || 3306),
    // Lê o nome de usuário sem colocar credenciais no código.
    user: env.MYSQL_USER,
    // Lê a senha do ambiente para autenticar as conexões do pool.
    password: env.MYSQL_PASSWORD,
    // Seleciona o banco configurado, usando demandas_app como alternativa.
    database: env.MYSQL_DATABASE || 'demandas_app',
    // Limita o pool a cinco conexões simultâneas.
    connectionLimit: 5,
    // Faz solicitações aguardarem quando todas as conexões estiverem ocupadas.
    waitForConnections: true,
    // Habilita parâmetros como :id, separados do texto da instrução SQL.
    namedPlaceholders: true,
    // Configura a conexão para texto Unicode com suporte a quatro bytes por caractere.
    charset: 'utf8mb4',
    // Devolve colunas DATE como texto, preservando a data civil sem conversão de fuso.
    dateStrings: ['DATE'],
    // Configura a interpretação de valores temporais pelo driver em UTC.
    timezone: 'Z',
    // Impede o envio de várias instruções SQL em uma mesma execução.
    multipleStatements: false
  });

  // Entrega uma conexão com transação aberta e operações adaptadas ao restante da aplicação.
  async function connection() {
    // Retira uma conexão disponível do pool ou aguarda sua liberação.
    const conn = await pool.getConnection();
    // Protege a inicialização: qualquer falha deve devolver a conexão ao pool.
    try {
      // Define também o fuso da sessão do MySQL em UTC.
      await conn.query("SET time_zone = '+00:00'");
      // Inicia a transação que agrupará as operações desta conexão.
      await conn.beginTransaction();
    // Captura falhas na configuração do fuso ou na abertura da transação.
    } catch (error) {
      // Libera a conexão adquirida, evitando esgotar o pool em caso de erro.
      conn.release();
      // Propaga a falha original para o chamador decidir como responder.
      throw error;
    }
    // Expõe uma interface menor sem entregar a conexão nativa diretamente às rotas.
    return {
      // Define a consulta de leitura, recebendo o SQL e os parâmetros nomeados.
      async query(sql: string, binds: any = {}) {
        // Executa a instrução preparada; a desestruturação separa as linhas dos metadados do mysql2.
        const [rows] = await conn.execute(sql, binds);
        // Retorna somente as linhas, que é o formato esperado pelas consultas das rotas.
        return rows;
      },
      // Define a operação de escrita com a mesma separação entre SQL e parâmetros.
      async execute(sql: string, binds: any = {}) {
        // Obtém o resultado da escrita, incluindo insertId e affectedRows.
        const [result] = await conn.execute(sql, binds);
        // Entrega esse resultado à rota para identificar o registro ou conferir a alteração.
        return result;
      },
      // Confirma explicitamente as alterações da transação atual.
      commit: () => conn.commit(),
      // Permite desfazer explicitamente as alterações ainda não confirmadas.
      rollback: () => conn.rollback(),
      // Define a devolução segura desta conexão ao pool.
      async close() {
        // Nunca devolva ao pool uma transação aberta, inclusive em leituras/erros.
        // Tenta encerrar qualquer transação restante; o finally libera a conexão mesmo se o rollback falhar.
        try { await conn.rollback(); } finally { conn.release(); }
      }
    };
  }

  // Entrega os serviços usados pelo servidor e pelas rotas.
  return {
    // Expõe a fábrica de conexões transacionais definida acima.
    connection,
    // Fecha o pool e suas conexões durante o encerramento da aplicação.
    close: () => pool.end()
  };
}

// Exporta a fábrica para o servidor e para os testes de persistência.
export { createMysqlDatabase };

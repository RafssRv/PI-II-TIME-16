// Autor majoritário: Vinicius Panutti Salgado — R.A. 25007329.
// Importa o executor de testes nativo do Node, sem depender de um framework adicional.
const test = require('node:test');
// Usa asserções estritas, que não fazem conversão implícita entre números e textos.
const assert = require('node:assert/strict');
// Importa a fábrica do adaptador de banco que será exercitada com um driver falso.
const { createMysqlDatabase } = require('../src/database');

// Verifica configuração do pool e sequência de confirmação, rollback de segurança e liberação.
test('pool usa parâmetros nomeados e sempre encerra a transação antes de liberar', async () => {
  // Registra cada operação do driver falso para conferir a ordem das chamadas.
  const events = [];
  // Reserva o objeto que receberá as opções entregues à criação do pool.
  let options;
  // Simula a conexão nativa do mysql2 sem abrir um banco real.
  const conn = {
    // Registra o SQL de configuração do fuso executado ao adquirir a conexão.
    async query(sql) { events.push(sql); },
    // Registra o início da transação para verificar que ele ocorre antes das operações da rota.
    async beginTransaction() { events.push('begin'); },
    // Simula a operação preparada do driver, recebendo instrução e parâmetros separados.
    async execute(sql, binds) {
      // Guarda a instrução e seus parâmetros para permitir inspeção do teste.
      events.push({ sql, binds });
      // Devolve a estrutura do mysql2: linhas para SELECT e metadados de resultado para escrita.
      return sql.startsWith('SELECT') ? [[{ id: 7 }]] : [{ insertId: 8, affectedRows: 1 }];
    },
    // Registra a confirmação da transação.
    async commit() { events.push('commit'); },
    // Registra a tentativa de desfazer a transação ainda aberta.
    async rollback() { events.push('rollback'); },
    // Registra a devolução da conexão ao pool.
    release() { events.push('release'); }
  };
  // Injeta ambiente vazio e driver falso para testar os padrões sem depender de configuração local.
  const database = createMysqlDatabase({ env: {}, driver: { createPool(config) {
    // Captura a configuração calculada pelo adaptador real.
    options = config;
    // Entrega o pool simulado, com aquisição da conexão falsa e encerramento sem efeito externo.
    return { async getConnection() { return conn; }, async end() {} };
  } } });
  // Solicita uma conexão pelo adaptador, acionando a preparação do fuso e da transação.
  const c = await database.connection();
  // Confirma que o pool aceita parâmetros nomeados como :id.
  assert.equal(options.namedPlaceholders, true);
  // Confirma que várias instruções no mesmo comando continuam desabilitadas.
  assert.equal(options.multipleStatements, false);
  // Confirma a porta padrão quando não existe MYSQL_PORT no ambiente injetado.
  assert.equal(options.port, 3306);
  // Verifica o vínculo de :id e a devolução apenas das linhas, sem o invólucro do driver.
  assert.deepEqual(await c.query('SELECT id FROM usuarios WHERE id = :id', { id: 7 }), [{ id: 7 }]);
  // Verifica que escritas expõem insertId para identificar o registro criado.
  assert.equal((await c.execute('INSERT INTO projetos (nome) VALUES (:nome)', { nome: 'PI' })).insertId, 8);
  // Solicita a confirmação explícita da transação simulada.
  await c.commit();
  // Aciona a limpeza final e a devolução da conexão.
  await c.close();
  // Exige a sequência commit, rollback de segurança e release ao concluir o uso.
  assert.deepEqual(events.slice(-3), ['commit', 'rollback', 'release']);
  // Confere que o início da transação foi registrado logo após o SQL de configuração do fuso.
  assert.equal(events[1], 'begin');
});

// Exercita a liberação do recurso quando a inicialização da transação falha.
test('falha ao iniciar transação não retém conexão no pool', async () => {
  // Guarda se release foi chamado durante o tratamento da falha.
  let released = false;
  // Injeta um segundo driver falso, dedicado a provocar erro de inicialização.
  const database = createMysqlDatabase({ env: {}, driver: { createPool() {
    // Faz o pool devolver a conexão cujas operações são especificadas abaixo.
    return { async getConnection() { return {
      // Aceita a configuração do fuso para que o erro ocorra somente no passo seguinte.
      async query() {},
      // Provoca uma rejeição em beginTransaction para exercitar o caminho de erro do adaptador.
      async beginTransaction() { throw new Error('Falha de conexão'); },
      // Marca a conexão como liberada quando o tratamento de erro chama release.
      release() { released = true; }
    }; } };
  } } });
  // Exige a rejeição da aquisição e a preservação da mensagem do erro original.
  await assert.rejects(database.connection(), /Falha de conexão/);
  // Confirma que a falha não deixou a conexão retida no pool.
  assert.equal(released, true);
});

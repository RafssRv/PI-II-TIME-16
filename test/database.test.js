/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (testes de conexão com o banco)

Descrição: 
Confere a configuração das conexões e a execução de consultas com parâmetros nomeados. Verifica se as transações
são encerradas antes de liberar a conexão, inclusive quando ocorre uma falha ao iniciar a transação
*/
// node:test é o executor de testes que vem com o próprio Node.js e assert/strict traz as verificações em modo estrito.
const test = require('node:test');
const assert = require('node:assert/strict');
// Carrega o database.ts pelo atalho src/database.js. Os testes usam um driver falso, então não precisam de MySQL.
const { createMysqlDatabase } = require('../src/database');

// Este teste usa um "driver" falso no lugar do mysql2. Como o createMysqlDatabase recebe o driver como parâmetro,
// basta entregar um objeto que imita o pool e a conexão e anota tudo o que acontece em "events". Depois o teste
// confere a ORDEM dos eventos e as opções com que o pool foi criado.
test('pool usa parâmetros nomeados e sempre encerra a transação antes de liberar', async () => {
  const events = [];
  let options;
  // Conexão falsa: cada método registra o que recebeu. O execute imita o formato do mysql2, que devolve um par
  // [resultado, informações das colunas]: para SELECT, uma lista de linhas; para os demais, um objeto com
  // insertId e affectedRows.
  const conn = {
    async query(sql) { events.push(sql); },
    async beginTransaction() { events.push('begin'); },
    async execute(sql, binds) {
      events.push({ sql, binds });
      return sql.startsWith('SELECT') ? [[{ id: 7 }]] : [{ insertId: 8, affectedRows: 1 }];
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  // O createPool falso guarda as opções recebidas (options) e devolve um pool que entrega sempre a mesma conexão.
  // Com env vazio (env: {}), valem os valores padrão do database.ts, como a porta 3306.
  const database = createMysqlDatabase({ env: {}, driver: { createPool(config) {
    options = config;
    return { async getConnection() { return conn; }, async end() {} };
  } } });
  const c = await database.connection();
  // Confere as opções do pool: parâmetros nomeados ligados, várias instruções por chamada desligadas e porta padrão.
  assert.equal(options.namedPlaceholders, true);
  assert.equal(options.multipleStatements, false);
  assert.equal(options.port, 3306);
  // Confere que query devolve só as linhas (e não o par completo do driver) e que execute devolve o resultado com
  // o insertId. Os parâmetros são nomeados (:id e :nome).
  assert.deepEqual(await c.query('SELECT id FROM usuarios WHERE id = :id', { id: 7 }), [{ id: 7 }]);
  assert.equal((await c.execute('INSERT INTO projetos (nome) VALUES (:nome)', { nome: 'PI' })).insertId, 8);
  await c.commit();
  await c.close();
  // Os três últimos eventos provam que o close() faz rollback antes de devolver a conexão ao pool, mesmo depois
  // do commit (nesse caso o rollback não desfaz nada). Nunca volta ao pool uma transação aberta.
  assert.deepEqual(events.slice(-3), ['commit', 'rollback', 'release']);
  // O primeiro evento é o ajuste do fuso horário e o segundo é o início da transação ('begin'): toda conexão
  // já nasce dentro de uma transação.
  assert.equal(events[1], 'begin');
});

// Simula uma conexão em que o início da transação falha. O esperado é que o erro seja repassado a quem chamou e
// que a conexão seja devolvida ao pool (release), para não ficar presa e esgotar as 5 conexões disponíveis.
test('falha ao iniciar transação não retém conexão no pool', async () => {
  let released = false;
  const database = createMysqlDatabase({ env: {}, driver: { createPool() {
    return { async getConnection() { return {
      async query() {},
      async beginTransaction() { throw new Error('Falha de conexão'); },
      release() { released = true; }
    }; } };
  } } });
  await assert.rejects(database.connection(), /Falha de conexão/);
  assert.equal(released, true);
});
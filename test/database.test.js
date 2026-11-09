// Autor: Vinicius Panutti Salgado — R.A. 25007329
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMysqlDatabase } = require('../src/database');

test('pool usa parâmetros nomeados e sempre encerra a transação antes de liberar', async () => {
  const events = [];
  let options;
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
  const database = createMysqlDatabase({ env: {}, driver: { createPool(config) {
    options = config;
    return { async getConnection() { return conn; }, async end() {} };
  } } });
  const c = await database.connection();
  assert.equal(options.namedPlaceholders, true);
  assert.equal(options.multipleStatements, false);
  assert.equal(options.port, 3306);
  assert.deepEqual(await c.query('SELECT id FROM usuarios WHERE id = :id', { id: 7 }), [{ id: 7 }]);
  assert.equal((await c.execute('INSERT INTO projetos (nome) VALUES (:nome)', { nome: 'PI' })).insertId, 8);
  await c.commit();
  await c.close();
  assert.deepEqual(events.slice(-3), ['commit', 'rollback', 'release']);
  assert.equal(events[1], 'begin');
});

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

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

function fakeDatabase({ queries = [], execute } = {}) {
  const state = { committed: 0, rolledBack: 0, executed: [] };
  return {
    state,
    async connection() {
      return {
        async query(sql) { const match = queries.find((item) => sql.includes(item.sql)); return match ? match.rows : []; },
        async execute(sql, binds) {
          state.executed.push({ sql, binds });
          if (execute) return execute(sql, binds);
          return { affectedRows: 1, insertId: 10 };
        },
        async commit() { state.committed += 1; },
        async rollback() { state.rolledBack += 1; },
        async close() {}
      };
    }
  };
}

async function request(app, path, options) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    return await fetch(`http://127.0.0.1:${address.port}${path}`, options);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health confirma a conexão', async () => {
  const response = await request(createApp(fakeDatabase()), '/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { database: 'online' });
});

test('criação de demanda exige todos os campos', async () => {
  const response = await request(createApp(fakeDatabase()), '/api/demandas', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titulo: 'Teste' })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /projeto_id/);
});

test('criação de demanda e histórico usam uma transação', async () => {
  const database = fakeDatabase();
  const response = await request(createApp(database), '/api/demandas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projeto_id: 1, criador_id: 2, titulo: 'Nova demanda', descricao: 'Descrição válida', tipo: 'TAREFA', prioridade: 'MEDIA' })
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 10 });
  assert.equal(database.state.executed.length, 2);
  assert.match(database.state.executed[1].sql, /historico_demandas/);
  assert.equal(database.state.committed, 1);
});

test('exclusão remove dependências antes da demanda', async () => {
  const database = fakeDatabase();
  const response = await request(createApp(database), '/api/demandas/5', { method: 'DELETE' });
  assert.equal(response.status, 204);
  assert.match(database.state.executed[0].sql, /comentarios/);
  assert.match(database.state.executed[1].sql, /historico_demandas/);
  assert.match(database.state.executed[2].sql, /demandas/);
  assert.equal(database.state.committed, 1);
});

test('falha ao gravar histórico desfaz a criação da demanda', async () => {
  const database = fakeDatabase({ execute(sql) {
    if (sql.includes('historico_demandas')) throw Object.assign(new Error('Autor inexistente'), { status: 400 });
    return { affectedRows: 1, insertId: 10 };
  } });
  const response = await request(createApp(database), '/api/demandas', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projeto_id: 1, criador_id: 2, titulo: 'Nova demanda', descricao: 'Descrição válida', tipo: 'TAREFA', prioridade: 'MEDIA' })
  });
  assert.equal(response.status, 400);
  assert.equal(database.state.committed, 0);
  assert.equal(database.state.rolledBack, 1);
});

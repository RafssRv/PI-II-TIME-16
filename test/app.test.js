const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

function fakeDatabase({ queries = [], execute } = {}) {
  const state = { committed: 0, rolledBack: 0, executed: [], queried: [] };
  return {
    state,
    async connection() {
      return {
        async query(sql, binds) { state.queried.push({sql, binds}); const match = queries.find((item) => sql.includes(item.sql)); return match ? match.rows : []; },
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

test('exclusão física é bloqueada sem apagar dependências', async () => {
  const database = fakeDatabase();
  const response = await request(createApp(database), '/api/demandas/5', { method: 'DELETE' });
  assert.equal(response.status, 405);
  assert.equal(database.state.executed.length, 0);
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

test('dashboard usa dados persistidos e janela civil de São Paulo', async () => {
  const rows = [
    { id: 1, status: 'ABERTA', prioridade: 'CRITICA', tipo: 'DEFEITO', prazo: '2026-10-27' },
    { id: 2, status: 'EM_ANDAMENTO', prioridade: 'ALTA', tipo: 'TAREFA', prazo: '2026-11-03' },
    { id: 3, status: 'CONCLUIDA', prioridade: 'CRITICA', tipo: 'MELHORIA', prazo: '2026-10-28' },
    { id: 4, status: 'CANCELADA', prioridade: 'BAIXA', tipo: 'DOCUMENTACAO', prazo: null },
    { id: 5, status: 'EM_REVISAO', prioridade: 'MEDIA', tipo: 'TAREFA', prazo: '2026-11-04' }
  ];
  const database = fakeDatabase({ queries: [{ sql: 'SELECT d.*', rows }] });
  const response = await request(createApp(database, { now: () => new Date('2026-10-28T01:00:00Z') }), '/api/dashboard');
  const data = await response.json();
  assert.equal(data.totalDemandas, 5);
  assert.equal(data.quantidadesPorStatus.EM_REVISAO, 1);
  assert.equal(data.quantidadesPorPrioridade.CRITICA, 2);
  assert.equal(data.quantidadesPorTipo.TAREFA, 2);
  assert.deepEqual(data.demandasCriticasEmAberto.map(d => d.id), [1]);
  assert.deepEqual(data.demandasProximasDoPrazo.map(d => d.id), [1, 2]);
});

test('filtros e ordenação inválidos retornam 400', async () => {
  for (const query of ['status=OUTRO', 'tipo=SQL', 'projeto_id=-1', 'ordenacao=DROP%20TABLE', 'busca=a&busca=b']) {
    const response = await request(createApp(fakeDatabase()), '/api/demandas?' + query);
    assert.equal(response.status, 400, query);
  }
});

test('listagem vincula filtros e restringe ordenação a expressões fixas', async () => {
  const database = fakeDatabase();
  const response = await request(createApp(database), '/api/demandas?status=ABERTA&prioridade=CRITICA&tipo=TAREFA&projeto_id=2&responsavel_id=3&busca=teste&ordenacao=prioridade_desc');
  assert.equal(response.status, 200);
  const query = database.state.queried[0];
  assert.match(query.sql, /FIELD\(d.prioridade/);
  assert.equal(query.binds.busca, '%teste%');
  assert.equal(query.binds.projeto_id, 2);
  assert.equal(query.binds.responsavel_id, 3);
});

const current = { id: 5, projeto_id: 2, status: 'ABERTA', titulo: 'Título atual', descricao: 'Descrição atual válida', prioridade: 'MEDIA', tipo: 'TAREFA', prazo: null, responsavel_id: null };
function demandDb(row = current, execute) {
  return fakeDatabase({ queries: [{ sql: 'FOR UPDATE', rows: [row] }, { sql: 'projeto_membros', rows: [{ id: 2 }] }], execute });
}
function patch(app, body) {
  return request(app, '/api/demandas/5', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autor_id: 2, ...body }) });
}
test('edição registra apenas alterações reais com valores anterior e novo', async () => {
  const db = demandDb();
  assert.equal((await patch(createApp(db), { titulo: 'Novo título', prioridade: 'ALTA', status: 'EM_ANDAMENTO', responsavel_id: 2 })).status, 204);
  assert.equal(db.state.executed.length, 5);
  assert.equal(db.state.executed[1].binds.anterior, 'Título atual');
  assert.equal(db.state.executed[1].binds.novo, 'Novo título');
  assert.equal(db.state.committed, 1);
  const noop = demandDb();
  assert.equal((await patch(createApp(noop), { titulo: current.titulo })).status, 204);
  assert.equal(noop.state.executed.length, 0);
});
test('transições inválidas e cancelamento após conclusão são rejeitados', async () => {
  for (const [from, to] of [['ABERTA','CONCLUIDA'], ['EM_ANDAMENTO','ABERTA'], ['CONCLUIDA','CANCELADA'], ['CANCELADA','EM_ANDAMENTO']]) {
    const db = demandDb({ ...current, status: from });
    assert.equal((await patch(createApp(db), { status: to })).status, 400);
    assert.equal(db.state.executed.length, 0);
    assert.equal(db.state.rolledBack, 1);
  }
});
test('cancelamento grava histórico e nunca apaga registros', async () => {
  const db = demandDb();
  assert.equal((await patch(createApp(db), { status: 'CANCELADA' })).status, 204);
  assert.equal(db.state.executed.length, 2);
  assert.equal(db.state.executed[1].binds.novo, 'CANCELADA');
  assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
});
test('falha no histórico desfaz a edição', async () => {
  const db = demandDb(current, (sql) => {
    if (sql.includes('historico_demandas')) throw Object.assign(new Error('Falha de histórico'), { status: 400 });
    return { affectedRows: 1 };
  });
  assert.equal((await patch(createApp(db), { titulo: 'Novo título' })).status, 400);
  assert.equal(db.state.committed, 0);
  assert.equal(db.state.rolledBack, 1);
});
test('edição valida tipos, datas, texto e feriados', async () => {
  for (const body of [{ titulo: 3 }, { descricao: 'curta' }, { tipo: 'OUTRO' }, { prioridade: null }, { prazo: '2030-02-30' }, { prazo: '2020-01-01' }, { prazo: '2030-01-01' }, { responsavel_id: -1 }]) {
    assert.equal((await patch(createApp(demandDb(), { isHoliday: async () => true }), body)).status, 400, JSON.stringify(body));
  }
  const db = demandDb();
  assert.equal((await patch(createApp(db, { isHoliday: async () => false }), { prazo: '2030-12-30' })).status, 204);
  assert.equal(db.state.executed[0].binds.prazo, '2030-12-30');
});
test('comentários inválidos são rejeitados antes de escrever', async () => {
  for (const texto of ['', 'ab', 'x'.repeat(501), 123]) {
    const db = fakeDatabase();
    const response = await request(createApp(db), '/api/demandas/5/comentarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autor_id: 2, texto }) });
    assert.equal(response.status, 400);
    assert.equal(db.state.executed.length, 0);
  }
});
test('detalhe inexistente e rota desconhecida retornam JSON 404', async () => {
  for (const path of ['/api/demandas/99', '/api/nao-existe']) {
    const response = await request(createApp(fakeDatabase()), path);
    assert.equal(response.status, 404);
    assert.ok((await response.json()).error);
  }
});

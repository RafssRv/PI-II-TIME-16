// Autor: Vinicius Panutti Salgado — R.A. 25007329
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp: buildApp } = require('../src/app');

function createApp(database, options = {}) {
  return buildApp(database, { skipAuthorization: true, ...options });
}

function fakeDatabase({ queries = [], execute, query: queryResult } = {}) {
  const state = { committed: 0, rolledBack: 0, executed: [], queried: [] };
  return {
    state,
    async connection() {
      return {
        async query(sql, binds) {
          state.queried.push({sql, binds});
          if (queryResult) return queryResult(sql, binds);
          const match = queries.find((item) => sql.includes(item.sql));
          if (match) return match.rows;
          if (sql.includes('FROM projetos WHERE id = :id AND ativo = 1')) return [{ id: 1 }];
          if (sql.includes('FROM projeto_membros pm JOIN usuarios u')) return [{ id: 2 }];
          return [];
        },
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
    body: JSON.stringify({ projeto_id: 1, titulo: 'Nova demanda', descricao: 'Descrição válida', tipo: 'TAREFA', prioridade: 'MEDIA' })
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
    body: JSON.stringify({ projeto_id: 1, titulo: 'Nova demanda', descricao: 'Descrição válida', tipo: 'TAREFA', prioridade: 'MEDIA' })
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
  return request(app, '/api/demandas/5', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
// A troca de projeto usa autenticação real para conferir também os limites de cada perfil.
const senhaMovimentacao = 'SenhaTeste123!';
const hashMovimentacao = require('bcryptjs').hashSync(senhaMovimentacao, 4);
function moveDb({ perfil = 'ADMIN', origemPermitida = true, destinoPermitido = true, destinoAtivo = true, membrosDestino = [2], row = { ...current, responsavel_id: 2 } } = {}) {
  const usuario = { id: 9, nome: 'Pessoa de teste', email: 'movimentacao@local.test', perfil, senha_hash: hashMovimentacao };
  return fakeDatabase({ query(sql, binds = {}) {
    if (sql.includes('FROM usuarios WHERE LOWER(email)') || sql.includes('FROM usuarios WHERE id = :id')) return [usuario];
    if (sql.includes('FOR UPDATE')) return [row];
    if (sql.includes('FROM projetos WHERE id = :id AND ativo = 1')) return destinoAtivo && binds.id === 3 ? [{ id: 3 }] : [];
    if (sql.includes('SELECT 1 FROM projeto_membros WHERE')) {
      const permitido = Number(binds.projeto_id) === Number(row.projeto_id) ? origemPermitida : destinoPermitido;
      return permitido ? [{ ok: 1 }] : [];
    }
    if (sql.includes('FROM projeto_membros pm JOIN usuarios u')) {
      return Number(binds.projeto_id) === 3 && membrosDestino.includes(Number(binds.usuario_id)) ? [{ id: Number(binds.usuario_id) }] : [];
    }
    throw new Error(`Consulta inesperada no teste de movimentação: ${sql}`);
  } });
}
async function authenticatedRequest(database, path, method = 'GET', body) {
  const app = buildApp(database, { sessionSecret: 'segredo-exclusivo-dos-testes-de-movimentacao' });
  const login = await request(app, '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'movimentacao@local.test', senha: senhaMovimentacao })
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  return request(app, path, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
function moveDemand(database, body) {
  return authenticatedRequest(database, '/api/demandas/5', 'PATCH', body);
}

test('ADMIN troca projeto, mantém responsável da equipe de destino e registra histórico', async () => {
  const db = moveDb({ origemPermitida: false, destinoPermitido: false });
  assert.equal((await moveDemand(db, { projeto_id: 3 })).status, 204);
  assert.equal(db.state.executed[0].binds.projeto_id, 3);
  assert.equal(Object.hasOwn(db.state.executed[0].binds, 'responsavel_id'), false);
  assert.equal(db.state.executed[1].binds.campo, 'projeto_id');
  assert.equal(db.state.executed[1].binds.anterior, '2');
  assert.equal(db.state.executed[1].binds.novo, '3');
  assert.equal(db.state.executed[1].binds.autor_id, 9);
  assert.equal(db.state.executed.length, 2);
  assert.equal(db.state.committed, 1);
});

test('troca de projeto remove e registra responsável que não participa da nova equipe', async () => {
  const db = moveDb({ membrosDestino: [] });
  assert.equal((await moveDemand(db, { projeto_id: 3 })).status, 204);
  assert.equal(db.state.executed[0].binds.responsavel_id, null);
  const historico = db.state.executed.slice(1).map(({ binds }) => [binds.campo, binds.anterior, binds.novo]);
  assert.deepEqual(historico, [['projeto_id', '2', '3'], ['responsavel_id', '2', null]]);
  assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
});

test('troca de projeto aceita novo responsável apenas quando ele pertence ao destino', async () => {
  const db = moveDb({ membrosDestino: [4] });
  assert.equal((await moveDemand(db, { projeto_id: 3, responsavel_id: 4 })).status, 204);
  assert.equal(db.state.executed[0].binds.responsavel_id, 4);
  const invalido = moveDb({ membrosDestino: [4] });
  assert.equal((await moveDemand(invalido, { projeto_id: 3, responsavel_id: 2 })).status, 400);
  assert.equal(invalido.state.executed.length, 0);
  assert.equal(invalido.state.rolledBack, 1);
});

test('LIDER precisa estar vinculado aos projetos de origem e de destino para mover a demanda', async () => {
  for (const [origemPermitida, destinoPermitido, status] of [[true, true, 204], [true, false, 403], [false, true, 404]]) {
    const db = moveDb({ perfil: 'LIDER', origemPermitida, destinoPermitido });
    assert.equal((await moveDemand(db, { projeto_id: 3 })).status, status);
    if (status !== 204) {
      assert.equal(db.state.executed.length, 0);
      assert.equal(db.state.rolledBack, 1);
    }
  }
});

test('MEMBRO não pode alterar o projeto mesmo quando participa dos dois projetos', async () => {
  const db = moveDb({ perfil: 'MEMBRO' });
  assert.equal((await moveDemand(db, { projeto_id: 3 })).status, 403);
  assert.equal(db.state.executed.length, 0);
});

test('troca de projeto rejeita identificadores inválidos e projeto de destino indisponível', async () => {
  for (const projeto_id of [null, 0, -1, 'abc', 3.5]) {
    const db = moveDb();
    assert.equal((await moveDemand(db, { projeto_id })).status, 400);
    assert.equal(db.state.executed.length, 0);
  }
  const db = moveDb({ destinoAtivo: false });
  assert.equal((await moveDemand(db, { projeto_id: 3 })).status, 400);
  assert.equal(db.state.executed.length, 0);
});

test('salvar o mesmo projeto não altera o responsável nem gera histórico', async () => {
  const db = moveDb({ membrosDestino: [] });
  assert.equal((await moveDemand(db, { projeto_id: current.projeto_id })).status, 204);
  assert.equal(db.state.executed.length, 0);
});

// Confere a administração de projetos sem permitir exclusão física dos registros associados.
function projectDb({ perfil = 'ADMIN', execute } = {}) {
  const usuario = { id: 9, nome: 'Pessoa de teste', email: 'movimentacao@local.test', perfil, senha_hash: hashMovimentacao };
  const projetos = [{ id: 1, nome: 'Projeto ativo', ativo: 1 }, { id: 2, nome: 'Projeto inativo', ativo: 0 }];
  return fakeDatabase({ execute, query(sql) {
    if (sql.includes('FROM usuarios WHERE LOWER(email)') || sql.includes('FROM usuarios WHERE id = :id')) return [usuario];
    if (sql.includes('FROM projetos')) return /ativo\s*=\s*1/.test(sql) ? projetos.filter((projeto) => projeto.ativo) : projetos;
    throw new Error(`Consulta inesperada no teste de projetos: ${sql}`);
  } });
}

test('listagem padrão mantém apenas projetos ativos e ADMIN pode incluir inativos', async () => {
  const db = projectDb();
  const ativos = await authenticatedRequest(db, '/api/projetos');
  assert.equal(ativos.status, 200);
  assert.deepEqual((await ativos.json()).map((projeto) => projeto.id), [1]);
  const todos = await authenticatedRequest(db, '/api/projetos?incluir_inativos=1');
  assert.equal(todos.status, 200);
  assert.deepEqual((await todos.json()).map((projeto) => projeto.id), [1, 2]);
});

test('LIDER e MEMBRO não podem criar, desativar ou consultar todos os projetos inativos', async () => {
  for (const perfil of ['LIDER', 'MEMBRO']) {
    const db = projectDb({ perfil });
    assert.equal((await authenticatedRequest(db, '/api/projetos', 'POST', { nome: 'Novo projeto' })).status, 403);
    assert.equal((await authenticatedRequest(db, '/api/projetos/1', 'DELETE')).status, 403);
    assert.equal((await authenticatedRequest(db, '/api/projetos?incluir_inativos=1')).status, 403);
    assert.equal(db.state.executed.length, 0);
  }
});

test('ADMIN cadastra projeto com nome normalizado e descrição opcional', async () => {
  const db = projectDb();
  const response = await authenticatedRequest(db, '/api/projetos', 'POST', { nome: '  Novo projeto  ', descricao: null });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 10 });
  assert.equal(db.state.executed[0].binds.nome, 'Novo projeto');
  assert.equal(db.state.executed[0].binds.descricao, null);
  assert.equal(db.state.committed, 1);
});

test('cadastro de projeto rejeita nome inválido e descrição muito longa', async () => {
  for (const body of [{ nome: '' }, { nome: 'a' }, { nome: 'x'.repeat(101) }, { nome: 'Projeto', descricao: 'x'.repeat(1001) }]) {
    const db = projectDb();
    assert.equal((await authenticatedRequest(db, '/api/projetos', 'POST', body)).status, 400);
    assert.equal(db.state.executed.length, 0);
  }
});

test('desativação do projeto somente atualiza ativo sem apagar demandas ou histórico', async () => {
  const db = projectDb();
  assert.equal((await authenticatedRequest(db, '/api/projetos/1', 'DELETE')).status, 204);
  assert.equal(db.state.executed.length, 1);
  assert.match(db.state.executed[0].sql, /^UPDATE projetos SET ativo = 0/);
  assert.equal(db.state.executed[0].binds.id, 1);
  assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
  assert.equal(db.state.committed, 1);
});

test('desativação de projeto inexistente retorna 404', async () => {
  const db = projectDb({ execute: () => ({ affectedRows: 0 }) });
  assert.equal((await authenticatedRequest(db, '/api/projetos/999', 'DELETE')).status, 404);
  assert.equal(db.state.committed, 0);
});

test('filtro de projetos rejeita valores inválidos e parâmetros repetidos', async () => {
  for (const query of ['incluir_inativos=sim', 'incluir_inativos=1&incluir_inativos=0']) {
    const db = projectDb();
    assert.equal((await authenticatedRequest(db, '/api/projetos?' + query)).status, 400);
  }
});

test('comentários inválidos são rejeitados antes de escrever', async () => {
  for (const texto of ['', 'ab', 'x'.repeat(501), 123]) {
    const db = fakeDatabase();
    const response = await request(createApp(db), '/api/demandas/5/comentarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) });
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

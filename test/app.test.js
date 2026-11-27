/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (testes da API)

Descrição: 
Reúne testes das rotas utilizando um banco simulado. Verifica as validações, os filtros, as permissões e as operações
de demandas, projetos e usuários. Também confere o registro do histórico e a reversão das alterações quando ocorre uma falha
*/
// node:test é o executor de testes que vem com o próprio Node.js (não precisa instalar nada) e assert/strict
// traz as verificações (assert.equal, assert.deepEqual...) em modo estrito, sem conversões silenciosas de tipo.
const test = require('node:test');
const assert = require('node:assert/strict');
// O require do app passa pelo atalho src/app.js, que carrega o app.ts (TypeScript) via tsx.
const { createApp: buildApp } = require('../src/app');

// Dados exclusivos dos testes; o login passa pela mesma rota usada com MySQL.
// O hash usa custo 4 (no sistema real é 12) só para os testes rodarem rápido; a senha e o hash são fictícios.
const usuarioDosTestes = { id: 1, nome: 'Usuário de teste', email: 'teste@local.test', perfil: 'ADMIN' };
const senhaDosTestes = 'SenhaTeste123!';
const hashDosTestes = require('bcryptjs').hashSync(senhaDosTestes, 4);

// Monta o app para os testes com um banco simulado. Faz duas coisas: (1) responde às consultas de login e de
// verificação da sessão com o usuário ADMIN de teste, e (2) repassa todas as demais consultas ao banco falso do teste.
// Assim, o login e a sessão funcionam de verdade (rota /api/login, cookie e bcrypt), sem precisar de MySQL.
// O segredo da sessão tem mais de 32 caracteres, como o app exige.
function createApp(database, options = {}) {
  const bancoDosTestes = {
    ...database,
    async connection() {
      const conexao = await database.connection();
      return {
        ...conexao,
        async query(sql, binds) {
          if (sql.includes('FROM usuarios WHERE LOWER(email)')) return [{ ...usuarioDosTestes, senha_hash: hashDosTestes }];
          if (sql.includes('SELECT id, nome, email, perfil FROM usuarios WHERE id = :id AND ativo = 1')) return [usuarioDosTestes];
          return conexao.query(sql, binds);
        }
      };
    }
  };
  const app = buildApp(bancoDosTestes, { sessionSecret: 'segredo-exclusivo-dos-testes-da-aplicacao', ...options });
  // Marca o app para que a função request faça o login automaticamente antes de cada chamada.
  app.locals.autenticarNosTestes = true;
  return app;
}

// Banco falso em memória. Cada conexão registra o que aconteceu em "state": quantos commits e rollbacks houve,
// quais comandos de escrita foram executados (executed) e quais consultas foram feitas (queried). Os testes
// conferem esses registros para provar o que a rota fez, sem precisar de um MySQL real.
// Como programar as respostas: "queries" liga um trecho do SQL às linhas que devem voltar; "query" é uma função
// completa para casos mais elaborados; "execute" simula o resultado (ou um erro) de INSERT e UPDATE.
// Sem programação, devolve respostas padrão: projeto existe, responsável é membro, demais consultas vazias, e
// execute devolve uma linha afetada com insertId 10.
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

// Faz uma requisição HTTP de verdade contra o app: sobe o servidor em uma porta livre (listen(0)), chama a rota
// e fecha o servidor no final (finally). Quando o app foi criado por createApp, antes de cada chamada ela faz
// POST /api/login com o usuário de teste, pega o cookie de sessão da resposta e o envia na requisição seguinte.
// A rota /api/health é pública e dispensa o login.
async function request(app, path, options) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { ...options?.headers };
    if (app.locals.autenticarNosTestes && path !== '/api/health') {
      const login = await fetch(`${base}/api/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: usuarioDosTestes.email, senha: senhaDosTestes })
      });
      assert.equal(login.status, 200);
      headers.Cookie = login.headers.getSetCookie()[0].split(';')[0];
    }
    return await fetch(`${base}${path}`, { ...options, headers });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Confere que a rota pública de saúde responde 200 com o banco "online".
test('health confirma a conexão', async () => {
  const response = await request(createApp(fakeDatabase()), '/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { database: 'online' });
});

// Sem uma conexão com o banco válida (indefinida, nula ou um objeto vazio), o app se recusa a ser criado.
test('API exige uma conexão com o banco e não inicia no modo sem persistência', () => {
  for (const database of [undefined, null, {}]) {
    assert.throws(() => buildApp(database, { sessionSecret: 'segredo-exclusivo-dos-testes-da-aplicacao' }), /banco de dados/);
  }
});

// Com o banco vazio, as listagens devolvem listas vazias e o dashboard devolve tudo zerado,
// ou seja, o sistema não inventa dados de demonstração.
test('tabelas sem registros retornam listas vazias e indicadores zerados, sem dados de demonstração', async () => {
  for (const path of ['/api/demandas', '/api/projetos', '/api/usuarios', '/api/projetos/1/membros']) {
    const response = await request(createApp(fakeDatabase()), path);
    assert.equal(response.status, 200, path);
    assert.deepEqual(await response.json(), [], path);
  }
  const response = await request(createApp(fakeDatabase()), '/api/dashboard');
  assert.equal(response.status, 200);
  const resumo = await response.json();
  assert.equal(resumo.totalDemandas, 0);
  for (const contagens of [resumo.quantidadesPorStatus, resumo.quantidadesPorPrioridade, resumo.quantidadesPorTipo]) {
    assert.ok(Object.values(contagens).every(valor => valor === 0));
  }
  assert.deepEqual(resumo.demandasCriticasEmAberto, []);
  assert.deepEqual(resumo.demandasProximasDoPrazo, []);
});

// Enviar só o título faz a API responder 400 apontando o primeiro campo obrigatório que falta (projeto_id).
test('criação de demanda exige todos os campos', async () => {
  const response = await request(createApp(fakeDatabase()), '/api/demandas', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titulo: 'Teste' })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /projeto_id/);
});

// Para PATCH (editar) e DELETE (desativar): um id inválido gera 400 e nada é executado no banco; um id válido
// gera 204, um único UPDATE (nenhum DELETE de verdade) com o id certo, e um commit.
test('ADMIN edita e desativa usuários no banco, rejeitando identificadores inválidos', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    const options = method === 'PATCH'
      ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Pessoa atualizada' }) }
      : { method };
    const invalid = fakeDatabase();
    assert.equal((await request(createApp(invalid), '/api/usuarios/invalido', options)).status, 400);
    assert.equal(invalid.state.executed.length, 0);
    const database = fakeDatabase();
    assert.equal((await request(createApp(database), '/api/usuarios/2', options)).status, 204);
    assert.equal(database.state.executed.length, 1);
    assert.match(database.state.executed[0].sql, /^UPDATE usuarios SET/);
    assert.equal(database.state.executed[0].binds.id, 2);
    assert.equal(database.state.committed, 1);
  }
});

// Criar uma demanda executa dois comandos na mesma transação: o INSERT da demanda e o do histórico de criação.
// Só há um commit, no final.
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

// Regra do escopo: nenhuma demanda é apagada. DELETE /api/demandas/:id responde 405 e não executa nada no banco.
test('exclusão física é bloqueada sem apagar dependências', async () => {
  const database = fakeDatabase();
  const response = await request(createApp(database), '/api/demandas/5', { method: 'DELETE' });
  assert.equal(response.status, 405);
  assert.equal(database.state.executed.length, 0);
});

// Simula um erro ao gravar o histórico. Como a criação é uma transação, nada pode ficar gravado:
// o teste confere que não houve commit e que houve um rollback.
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

// O teste injeta o relógio (now) em 28/10 às 01:00 UTC, que em São Paulo ainda é 27/10 às 22:00. Então o "hoje" do
// dashboard é 27/10 e a janela de "próximas do prazo" vai de 27/10 a 03/11. Por isso entram as demandas 1 (prazo
// 27/10) e 2 (prazo 03/11), e ficam de fora a 5 (04/11, além da janela), a concluída (3) e a cancelada (4).
// Também confere as contagens por status, prioridade e tipo e as críticas em aberto (só a 1).
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

// Filtros fora da lista, id negativo, tentativa de SQL na ordenação e parâmetro repetido (busca=a&busca=b)
// são recusados com 400 antes de qualquer consulta ao banco.
test('filtros e ordenação inválidos retornam 400', async () => {
  for (const query of ['status=OUTRO', 'tipo=SQL', 'projeto_id=-1', 'ordenacao=DROP%20TABLE', 'busca=a&busca=b']) {
    const response = await request(createApp(fakeDatabase()), '/api/demandas?' + query);
    assert.equal(response.status, 400, query);
  }
});

// Com todos os filtros juntos, confere que os valores vão como parâmetros (binds) e que a ordenação usa uma
// expressão fixa do servidor (FIELD) em vez de texto vindo do usuário. A busca vira '%teste%' para o LIKE.
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

// Demanda usada como base nos testes de edição (projeto 2, status ABERTA, sem responsável nem prazo).
const current = { id: 5, projeto_id: 2, status: 'ABERTA', titulo: 'Título atual', descricao: 'Descrição atual válida', prioridade: 'MEDIA', tipo: 'TAREFA', prazo: null, responsavel_id: null };
// Banco falso para edição: a consulta com "FOR UPDATE" (que trava e lê a demanda) devolve a linha indicada, e as
// consultas de vínculo com o projeto devolvem um membro. O terceiro parâmetro permite simular falhas no execute.
function demandDb(row = current, execute) {
  return fakeDatabase({ queries: [{ sql: 'FOR UPDATE', rows: [row] }, { sql: 'projeto_membros', rows: [{ id: 2 }] }], execute });
}
// Atalho para enviar um PATCH em /api/demandas/5 com o corpo informado.
function patch(app, body) {
  return request(app, '/api/demandas/5', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
// Mudando quatro campos, são 5 comandos: 1 UPDATE + 4 linhas de histórico, cada uma com o valor anterior e o novo.
// Reenviar o mesmo título não muda nada: responde 204 sem executar comando algum e sem gerar histórico.
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
// Percorre pares "de -> para" que o ciclo de vida proíbe (por exemplo, concluir direto de Aberta, voltar de
// Em andamento para Aberta, cancelar uma demanda concluída). Todos devem dar 400, sem escrever nada, com rollback.
test('transições inválidas e cancelamento após conclusão são rejeitados', async () => {
  for (const [from, to] of [['ABERTA','CONCLUIDA'], ['EM_ANDAMENTO','ABERTA'], ['CONCLUIDA','CANCELADA'], ['CONCLUIDA','ABERTA'], ['CANCELADA','EM_ANDAMENTO'], ['CANCELADA','EM_REVISAO'], ['CANCELADA','CONCLUIDA']]) {
    const db = demandDb({ ...current, status: from });
    assert.equal((await patch(createApp(db), { status: to })).status, 400);
    assert.equal(db.state.executed.length, 0);
    assert.equal(db.state.rolledBack, 1);
  }
});
// Cancelar é só mudar o status: 2 comandos (UPDATE e histórico com o novo valor CANCELADA) e nenhum DELETE.
test('cancelamento grava histórico e nunca apaga registros', async () => {
  const db = demandDb();
  assert.equal((await patch(createApp(db), { status: 'CANCELADA' })).status, 204);
  assert.equal(db.state.executed.length, 2);
  assert.equal(db.state.executed[1].binds.novo, 'CANCELADA');
  assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
});
// Se o registro do histórico falha, a edição inteira é desfeita (sem commit, com um rollback).
test('falha no histórico desfaz a edição', async () => {
  const db = demandDb(current, (sql) => {
    if (sql.includes('historico_demandas')) throw Object.assign(new Error('Falha de histórico'), { status: 400 });
    return { affectedRows: 1 };
  });
  assert.equal((await patch(createApp(db), { titulo: 'Novo título' })).status, 400);
  assert.equal(db.state.committed, 0);
  assert.equal(db.state.rolledBack, 1);
});
// Corpos inválidos devem dar 400: título que não é texto, descrição curta, tipo desconhecido, prioridade nula,
// data inexistente (30/02), prazo no passado, prazo em feriado (aqui o feriado é simulado: isHoliday devolve
// sempre true, então 2030-01-01 conta como feriado) e responsável com id negativo.
// Depois, com isHoliday false, um prazo futuro comum é aceito (204) e chega ao banco como parâmetro.
test('edição valida tipos, datas, texto e feriados', async () => {
  for (const body of [{ titulo: 3 }, { descricao: 'curta' }, { tipo: 'OUTRO' }, { prioridade: null }, { prazo: '2030-02-30' }, { prazo: '2020-01-01' }, { prazo: '2030-01-01' }, { responsavel_id: -1 }]) {
    assert.equal((await patch(createApp(demandDb(), { isHoliday: async () => true }), body)).status, 400, JSON.stringify(body));
  }
  const db = demandDb();
  assert.equal((await patch(createApp(db, { isHoliday: async () => false }), { prazo: '2030-12-30' })).status, 204);
  assert.equal(db.state.executed[0].binds.prazo, '2030-12-30');
});
// A troca de projeto usa autenticação real para conferir também os limites de cada perfil.
// Daqui em diante, os testes escolhem o perfil do usuário logado (ADMIN, LIDER ou MEMBRO), em vez de sempre ADMIN.
const senhaMovimentacao = 'SenhaTeste123!';
const hashMovimentacao = require('bcryptjs').hashSync(senhaMovimentacao, 4);
// Banco falso para a movimentação de demandas e a reabertura. As opções controlam o cenário: o perfil do
// usuário, se ele é vinculado ao projeto de origem e ao de destino, se o destino está ativo, quem participa da
// equipe de destino e a demanda atual. A função "query" responde ao login, à demanda travada (FOR UPDATE), ao
// projeto de destino (só o id 3 existe e está ativo), aos vínculos do usuário e aos membros do destino.
// Se a rota fizer uma consulta que o teste não previu, lança um erro, o que evita testes que passam por engano.
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
// Cria o app com o banco informado, faz o login real (POST /api/login, com o usuário e a senha do moveDb),
// guarda o cookie da sessão e faz a requisição pedida enviando esse cookie.
async function authenticatedRequest(database, path, method = 'GET', body) {
  const app = buildApp(database, { sessionSecret: 'segredo-exclusivo-dos-testes-de-movimentacao' });
  const login = await request(app, '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'movimentacao@local.test', senha: senhaMovimentacao })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  await login.json();
  return request(app, path, {
    method, headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
// Atalho para enviar um PATCH de edição da demanda 5 já autenticado.
function moveDemand(database, body) {
  return authenticatedRequest(database, '/api/demandas/5', 'PATCH', body);
}

// Reabrir (cancelada para aberta) é permitido a ADMIN e a LIDER vinculado ao projeto. Gera dois comandos: o UPDATE
// do status (com atualizado_em) e o registro no histórico (campo status, de CANCELADA para ABERTA, com o autor
// certo). Nenhum DELETE: os dados são preservados.
test('ADMIN e LIDER autorizado reabrem demanda cancelada e registram histórico sem apagar dados', async () => {
  for (const perfil of ['ADMIN', 'LIDER']) {
    const db = moveDb({ perfil, row: { ...current, status: 'CANCELADA', responsavel_id: 9 } });
    const response = await authenticatedRequest(db, '/api/demandas/5', 'PATCH', { status: 'ABERTA' });
    assert.equal(response.status, 204);
    assert.equal(db.state.executed.length, 2);
    assert.deepEqual(db.state.executed[0].binds, { status: 'ABERTA', id: 5 });
    assert.match(db.state.executed[0].sql, /atualizado_em = CURRENT_TIMESTAMP/);
    const evento = db.state.executed[1].binds;
    assert.equal(evento.campo, 'status');
    assert.equal(evento.anterior, 'CANCELADA');
    assert.equal(evento.novo, 'ABERTA');
    assert.equal(evento.autor_id, 9);
    assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
    assert.equal(db.state.committed, 1);
  }
});

// O Membro não reabre demanda cancelada, mesmo sendo o responsável por ela: 403 e nada é escrito.
test('MEMBRO não reabre demanda cancelada nem quando ela está atribuída a si', async () => {
  const db = moveDb({ perfil: 'MEMBRO', row: { ...current, status: 'CANCELADA', responsavel_id: 9 } });
  assert.equal((await authenticatedRequest(db, '/api/demandas/5', 'PATCH', { status: 'ABERTA' })).status, 403);
  assert.equal(db.state.executed.length, 0);
});

// Um Líder que não faz parte do projeto da demanda recebe 404 (como se ela não existisse), sem escrever nada.
test('LIDER não reabre demanda de projeto ao qual não está vinculado', async () => {
  const db = moveDb({ perfil: 'LIDER', origemPermitida: false, row: { ...current, status: 'CANCELADA' } });
  assert.equal((await authenticatedRequest(db, '/api/demandas/5', 'PATCH', { status: 'ABERTA' })).status, 404);
  assert.equal(db.state.executed.length, 0);
});

// O ADMIN troca a demanda do projeto 2 para o 3 sem precisar de vínculo. Como o responsável (2) é membro do destino,
// ele é mantido (o UPDATE nem inclui responsavel_id). O histórico registra o campo projeto_id, de "2" para "3".
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

// Se o responsável não pertence à equipe do novo projeto, ele é removido (responsavel_id vira null) e isso também
// é registrado no histórico, em uma segunda linha (de "2" para vazio).
test('troca de projeto remove e registra responsável que não participa da nova equipe', async () => {
  const db = moveDb({ membrosDestino: [] });
  assert.equal((await moveDemand(db, { projeto_id: 3 })).status, 204);
  assert.equal(db.state.executed[0].binds.responsavel_id, null);
  const historico = db.state.executed.slice(1).map(({ binds }) => [binds.campo, binds.anterior, binds.novo]);
  assert.deepEqual(historico, [['projeto_id', '2', '3'], ['responsavel_id', '2', null]]);
  assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
});

// Ao trocar de projeto dá para indicar um novo responsável, mas só se ele estiver na equipe de destino. O usuário 4
// é aceito; o usuário 2 (que não está no destino) é recusado com 400, sem escrever nada e com rollback.
test('troca de projeto aceita novo responsável apenas quando ele pertence ao destino', async () => {
  const db = moveDb({ membrosDestino: [4] });
  assert.equal((await moveDemand(db, { projeto_id: 3, responsavel_id: 4 })).status, 204);
  assert.equal(db.state.executed[0].binds.responsavel_id, 4);
  const invalido = moveDb({ membrosDestino: [4] });
  assert.equal((await moveDemand(invalido, { projeto_id: 3, responsavel_id: 2 })).status, 400);
  assert.equal(invalido.state.executed.length, 0);
  assert.equal(invalido.state.rolledBack, 1);
});

// O Líder precisa ser vinculado aos DOIS projetos. As combinações [origem, destino, status esperado] são:
// os dois vinculados dá 204; sem vínculo com o destino dá 403; sem vínculo com a origem dá 404.
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

// O Membro nunca troca o projeto de uma demanda, mesmo participando dos dois projetos: 403.
test('MEMBRO não pode alterar o projeto mesmo quando participa dos dois projetos', async () => {
  const db = moveDb({ perfil: 'MEMBRO' });
  assert.equal((await moveDemand(db, { projeto_id: 3 })).status, 403);
  assert.equal(db.state.executed.length, 0);
});

// Ids de projeto inválidos (nulo, zero, negativo, texto, decimal) e destino inativo dão 400, sem escrever nada.
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

// "Salvar" o mesmo projeto não é uma alteração: responde 204 sem executar nada (nem mexe no responsável).
test('salvar o mesmo projeto não altera o responsável nem gera histórico', async () => {
  const db = moveDb({ membrosDestino: [] });
  assert.equal((await moveDemand(db, { projeto_id: current.projeto_id })).status, 204);
  assert.equal(db.state.executed.length, 0);
});

// Confere a administração de projetos sem permitir exclusão física dos registros associados.
// projectDb simula dois projetos (um ativo e outro inativo) e o usuário logado com o perfil escolhido. O SELECT
// em projetos respeita o filtro "ativo = 1" quando ele aparece na consulta.
function projectDb({ perfil = 'ADMIN', execute } = {}) {
  const usuario = { id: 9, nome: 'Pessoa de teste', email: 'movimentacao@local.test', perfil, senha_hash: hashMovimentacao };
  const projetos = [{ id: 1, nome: 'Projeto ativo', ativo: 1 }, { id: 2, nome: 'Projeto inativo', ativo: 0 }];
  return fakeDatabase({ execute, query(sql) {
    if (sql.includes('FROM usuarios WHERE LOWER(email)') || sql.includes('FROM usuarios WHERE id = :id')) return [usuario];
    if (sql.includes('FROM projetos')) return /ativo\s*=\s*1/.test(sql) ? projetos.filter((projeto) => projeto.ativo) : projetos;
    throw new Error(`Consulta inesperada no teste de projetos: ${sql}`);
  } });
}

// Por padrão, a listagem traz só o projeto ativo (id 1). O ADMIN, com incluir_inativos=1, vê também o inativo (id 2).
test('listagem padrão mantém apenas projetos ativos e ADMIN pode incluir inativos', async () => {
  const db = projectDb();
  const ativos = await authenticatedRequest(db, '/api/projetos');
  assert.equal(ativos.status, 200);
  assert.deepEqual((await ativos.json()).map((projeto) => projeto.id), [1]);
  const todos = await authenticatedRequest(db, '/api/projetos?incluir_inativos=1');
  assert.equal(todos.status, 200);
  assert.deepEqual((await todos.json()).map((projeto) => projeto.id), [1, 2]);
});

// Líder e Membro recebem 403 ao tentar criar projeto, desativar projeto ou consultar os inativos, e nada é escrito.
test('LIDER e MEMBRO não podem criar, desativar ou consultar todos os projetos inativos', async () => {
  for (const perfil of ['LIDER', 'MEMBRO']) {
    const db = projectDb({ perfil });
    assert.equal((await authenticatedRequest(db, '/api/projetos', 'POST', { nome: 'Novo projeto' })).status, 403);
    assert.equal((await authenticatedRequest(db, '/api/projetos/1', 'DELETE')).status, 403);
    assert.equal((await authenticatedRequest(db, '/api/projetos?incluir_inativos=1')).status, 403);
    assert.equal(db.state.executed.length, 0);
  }
});

// O ADMIN cadastra um projeto: o nome é gravado sem os espaços das pontas e a descrição opcional (null) é aceita.
test('ADMIN cadastra projeto com nome normalizado e descrição opcional', async () => {
  const db = projectDb();
  const response = await authenticatedRequest(db, '/api/projetos', 'POST', { nome: '  Novo projeto  ', descricao: null });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 10 });
  assert.equal(db.state.executed[0].binds.nome, 'Novo projeto');
  assert.equal(db.state.executed[0].binds.descricao, null);
  assert.equal(db.state.committed, 1);
});

// Nome vazio, com 1 caractere ou com mais de 100, e descrição com mais de 1000 caracteres: tudo isso dá 400.
test('cadastro de projeto rejeita nome inválido e descrição muito longa', async () => {
  for (const body of [{ nome: '' }, { nome: 'a' }, { nome: 'x'.repeat(101) }, { nome: 'Projeto', descricao: 'x'.repeat(1001) }]) {
    const db = projectDb();
    assert.equal((await authenticatedRequest(db, '/api/projetos', 'POST', body)).status, 400);
    assert.equal(db.state.executed.length, 0);
  }
});

// Desativar um projeto faz um único UPDATE (ativo = 0) e nenhum DELETE: demandas e histórico ficam intactos.
test('desativação do projeto somente atualiza ativo sem apagar demandas ou histórico', async () => {
  const db = projectDb();
  assert.equal((await authenticatedRequest(db, '/api/projetos/1', 'DELETE')).status, 204);
  assert.equal(db.state.executed.length, 1);
  assert.match(db.state.executed[0].sql, /^UPDATE projetos SET ativo = 0/);
  assert.equal(db.state.executed[0].binds.id, 1);
  assert.ok(db.state.executed.every(({ sql }) => !sql.includes('DELETE')));
  assert.equal(db.state.committed, 1);
});

// Quando o UPDATE não afeta nenhuma linha (id 999 não existe), a resposta é 404 e não há commit.
test('desativação de projeto inexistente retorna 404', async () => {
  const db = projectDb({ execute: () => ({ affectedRows: 0 }) });
  assert.equal((await authenticatedRequest(db, '/api/projetos/999', 'DELETE')).status, 404);
  assert.equal(db.state.committed, 0);
});

// O filtro incluir_inativos só aceita 0 ou 1 e uma única vez: "sim" e o parâmetro repetido dão 400.
test('filtro de projetos rejeita valores inválidos e parâmetros repetidos', async () => {
  for (const query of ['incluir_inativos=sim', 'incluir_inativos=1&incluir_inativos=0']) {
    const db = projectDb();
    assert.equal((await authenticatedRequest(db, '/api/projetos?' + query)).status, 400);
  }
});

// Comentário vazio, curto demais (menos de 3), longo demais (mais de 500) ou que não é texto: 400, sem escrever.
test('comentários inválidos são rejeitados antes de escrever', async () => {
  for (const texto of ['', 'ab', 'x'.repeat(501), 123]) {
    const db = fakeDatabase();
    const response = await request(createApp(db), '/api/demandas/5/comentarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) });
    assert.equal(response.status, 400);
    assert.equal(db.state.executed.length, 0);
  }
});
// Uma demanda que não existe e uma rota desconhecida respondem 404 em formato JSON, com uma mensagem de erro.
test('detalhe inexistente e rota desconhecida retornam JSON 404', async () => {
  for (const path of ['/api/demandas/99', '/api/nao-existe']) {
    const response = await request(createApp(fakeDatabase()), path);
    assert.equal(response.status, 404);
    assert.ok((await response.json()).error);
  }
});
/*
Autor: Vinícius Panutti Salgado - RA: 25007329
Tela: Uso geral do sistema (integração com MySQL real)

Descrição: 
Verifica o funcionamento conjunto da API e do MySQL, passando pelo cadastro, login e operações de demandas,
comentários e histórico. Utiliza um banco exclusivo de testes, com nome terminado em _test, e só executa quando a variável
MYSQL_INTEGRATION está definida como 1
*/

// Carrega variáveis de ambiente do .env sem exibir avisos no console
require('dotenv').config({ quiet: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMysqlDatabase } = require('../src/database');

// Executa o teste de integração ponta a ponta apenas quando MYSQL_INTEGRATION=1 estiver ativo
test('MySQL real: cadastro, login, CRUD, comentários e histórico', {
  skip: process.env.MYSQL_INTEGRATION !== '1'
}, async () => {
  // Trava de segurança para evitar execução acidental em banco de desenvolvimento ou produção
  assert.match(process.env.MYSQL_DATABASE || '', /_test$/, 'Use um banco exclusivo terminado em _test.');

  const database = createMysqlDatabase();
  const server = createApp(database).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  const base = `http://127.0.0.1:${server.address().port}/api`;
  // Armazena os IDs criados durante o teste para limpeza garantida no bloco finally
  const created = {};
  let cookie = '';

  // Helper HTTP: envia requisições JSON, mantém o cookie de sessão e valida o status HTTP esperado
  async function call(path, method = 'GET', body, status = 200) {
    const headers = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies[0].split(';')[0];

    // Respostas 204 (No Content) não possuem corpo JSON
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }

  try {
    // Verifica saúde da API e garante que rotas privadas exigem autenticação
    await call('/health');
    await call('/projetos', 'GET', undefined, 401);

    // Em banco populado, autentica com um ADMIN existente.
    // Em banco vazio, mantém o teste do cadastro inicial por bootstrap.
    const connection = await database.connection();
    let totalUsuarios;
    try {
      const rows = await connection.query('SELECT COUNT(*) AS total FROM usuarios');
      totalUsuarios = Number(rows[0]?.total || 0);
    } finally {
      await connection.close();
    }

    if (totalUsuarios > 0) {
      const adminEmail = process.env.MYSQL_TEST_ADMIN_EMAIL;
      const adminPassword = process.env.MYSQL_TEST_ADMIN_PASSWORD;
      assert.ok(
        adminEmail && adminPassword,
        'Banco populado: informe MYSQL_TEST_ADMIN_EMAIL e MYSQL_TEST_ADMIN_PASSWORD de um ADMIN.'
      );
      const adminSession = await call('/login', 'POST', {
        email: adminEmail,
        senha: adminPassword
      });
      assert.equal(adminSession.perfil, 'ADMIN');
    }

    // 1. Cadastro e login com usuário exclusivo gerado via timestamp para evitar conflito de e-mail
    const email = `mysql-${Date.now()}@local.test`;
    created.usuario = (await call('/usuarios', 'POST', { nome: 'Teste MySQL', email, senha: 'SenhaTeste123!', perfil: 'ADMIN' }, 201)).id;
    const sessao = await call('/login', 'POST', { email, senha: 'SenhaTeste123!' });
    assert.equal(sessao.id, created.usuario);
    assert.equal((await call('/sessao')).id, created.usuario);

    // 2. Criação de projeto, vínculo de membro e criação de demanda
    created.projeto = (await call('/projetos', 'POST', { nome: 'Projeto teste MySQL' }, 201)).id;
    await call(`/projetos/${created.projeto}/membros`, 'POST', { usuario_id: created.usuario }, 204);
    created.demanda = (await call('/demandas', 'POST', {
      projeto_id: created.projeto,
      responsavel_id: created.usuario,
      titulo: 'Teste de persistência',
      descricao: 'Demanda criada pelo teste de integração.',
      tipo: 'TAREFA',
      prioridade: 'MEDIA',
      prazo: '2030-12-31'
    }, 201)).id;

    // 3. Atualização de status e ciclo de criação/edição de comentário
    await call(`/demandas/${created.demanda}`, 'PATCH', { status: 'EM_ANDAMENTO' }, 204);
    created.comentario = (await call(`/demandas/${created.demanda}/comentarios`, 'POST', { texto: 'Comentário de teste' }, 201)).id;
    await call(`/comentarios/${created.comentario}`, 'PATCH', { texto: 'Comentário editado' }, 204);

    // Valida persistência dos detalhes, comentários e registros iniciais de histórico
    const detail = await call(`/demandas/${created.demanda}`);
    assert.equal(detail.status, 'EM_ANDAMENTO');
    assert.equal(detail.prazo, '2030-12-31');
    assert.equal(detail.comentarios[0].texto, 'Comentário editado');
    assert.equal(detail.historico.length, 2);
    assert.equal((await call(`/demandas/${created.demanda}/comentarios`)).length, 1);

    // 4. Edição de múltiplos campos da demanda (incluindo limpeza do prazo para null)
    await call(`/demandas/${created.demanda}`, 'PATCH', {
      titulo: 'Demanda editada no MySQL',
      tipo: 'DOCUMENTACAO',
      prioridade: 'CRITICA',
      prazo: null
    }, 204);

    const persisted = await call(`/demandas/${created.demanda}`);
    assert.equal(persisted.titulo, 'Demanda editada no MySQL');
    assert.equal(persisted.tipo, 'DOCUMENTACAO');
    assert.equal(persisted.prioridade, 'CRITICA');
    assert.equal(persisted.prazo, null);

    // 5. Garante que exclusão física de demanda é bloqueada (405) e o cancelamento ocorre via PATCH
    await call(`/demandas/${created.demanda}`, 'DELETE', undefined, 405);
    await call(`/demandas/${created.demanda}`, 'PATCH', { status: 'CANCELADA' }, 204);

    const cancelled = await call(`/demandas/${created.demanda}`);
    assert.equal(cancelled.status, 'CANCELADA');
    assert.equal(cancelled.historico.length, 7);
    assert.equal(cancelled.comentarios[0].texto, 'Comentário editado');

    // 6. Exclusão de comentário, listagem com filtros/ordenação e métricas do dashboard
    await call(`/comentarios/${created.comentario}`, 'DELETE', undefined, 204);
    const filtered = await call(`/demandas?projeto_id=${created.projeto}&status=CANCELADA&ordenacao=prioridade_desc`);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, created.demanda);

    const dashboard = await call('/dashboard');
    assert.ok(dashboard.quantidadesPorStatus.CANCELADA >= 1);
    // Demanda cancelada não deve aparecer entre demandas críticas em aberto
    assert.ok(!dashboard.demandasCriticasEmAberto.some(d => d.id === created.demanda));

    // 7. Encerramento da sessão e verificação de bloqueio após logout
    await call('/logout', 'POST');
    await call('/sessao', 'GET', undefined, 401);
  } finally {
    // Limpeza direta no banco na ordem inversa das chaves estrangeiras para não deixar resíduos
    const c = await database.connection();
    try {
      if (created.demanda) {
        await c.execute('DELETE FROM comentarios WHERE demanda_id = :id', { id: created.demanda });
        await c.execute('DELETE FROM historico_demandas WHERE demanda_id = :id', { id: created.demanda });
        await c.execute('DELETE FROM demandas WHERE id = :id', { id: created.demanda });
      }
      if (created.projeto) {
        await c.execute('DELETE FROM projeto_membros WHERE projeto_id = :id', { id: created.projeto });
        await c.execute('DELETE FROM projetos WHERE id = :id', { id: created.projeto });
      }
      if (created.usuario) await c.execute('DELETE FROM usuarios WHERE id = :id', { id: created.usuario });
      await c.commit();
    } finally {
      // Fecha conexão, servidor HTTP e pool do MySQL mesmo que alguma asserção falhe
      await c.close();
      await new Promise((resolve) => server.close(resolve));
      await database.close();
    }
  }
});
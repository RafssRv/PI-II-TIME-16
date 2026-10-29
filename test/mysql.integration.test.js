// Autor: Vinicius Panutti Salgado — R.A. 25007329
require('dotenv').config({ quiet: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMysqlDatabase } = require('../src/database');

test('MySQL real: cadastro, login, CRUD, comentários e histórico', {
  skip: process.env.MYSQL_INTEGRATION !== '1'
}, async () => {
  assert.match(process.env.MYSQL_DATABASE || '', /_test$/, 'Use um banco exclusivo terminado em _test.');
  const database = createMysqlDatabase();
  const server = createApp(database).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const created = {};
  async function call(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  try {
    await call('/health');
    const email = `mysql-${Date.now()}@local.test`;
    created.usuario = (await call('/usuarios', 'POST', { nome: 'Teste MySQL', email, senha: 'SenhaTeste123!', perfil: 'ADMIN' }, 201)).id;
    assert.equal((await call('/login', 'POST', { email, senha: 'SenhaTeste123!' })).id, created.usuario);
    created.projeto = (await call('/projetos', 'POST', { nome: 'Projeto teste MySQL' }, 201)).id;
    await call(`/projetos/${created.projeto}/membros`, 'POST', { usuario_id: created.usuario }, 204);
    created.demanda = (await call('/demandas', 'POST', {
      projeto_id: created.projeto, criador_id: created.usuario, responsavel_id: created.usuario,
      titulo: 'Teste de persistência', descricao: 'Demanda criada pelo teste de integração.', tipo: 'TAREFA', prioridade: 'MEDIA', prazo: '2030-12-31'
    }, 201)).id;
    await call(`/demandas/${created.demanda}`, 'PATCH', { autor_id: created.usuario, status: 'EM_ANDAMENTO' }, 204);
    created.comentario = (await call(`/demandas/${created.demanda}/comentarios`, 'POST', { autor_id: created.usuario, texto: 'Comentário de teste' }, 201)).id;
    await call(`/comentarios/${created.comentario}`, 'PATCH', { texto: 'Comentário editado' }, 204);
    const detail = await call(`/demandas/${created.demanda}`);
    assert.equal(detail.status, 'EM_ANDAMENTO');
    assert.equal(detail.prazo, '2030-12-31');
    assert.equal(detail.comentarios[0].texto, 'Comentário editado');
    assert.equal(detail.historico.length, 2);
    await call(`/comentarios/${created.comentario}`, 'DELETE', undefined, 204);
    await call(`/demandas/${created.demanda}`, 'DELETE', undefined, 204);
    await call(`/demandas/${created.demanda}`, 'GET', undefined, 404);
  } finally {
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
      await c.close();
      await new Promise((resolve) => server.close(resolve));
      await database.close();
    }
  }
});

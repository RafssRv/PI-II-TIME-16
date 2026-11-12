require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { registrarLogin } = require('../src/rotas/login.ts');
const { registrarUsuarios } = require('../src/rotas/usuarios.ts');

const senha = 'SenhaTeste123!';
const hash = bcrypt.hashSync(senha, 4);
const usuario = { id: 9, nome: 'Pessoa de teste', email: 'login@local.test', perfil: 'ADMIN' };

function bancoTeste({ perfil = 'ADMIN', falharConsulta = false } = {}) {
  const pessoa = { ...usuario, perfil };
  const estado = { abertas: 0, fechadas: 0, consultas: [] };
  return {
    estado,
    async connection() {
      estado.abertas++;
      return {
        async query(sql, binds = {}) {
          estado.consultas.push(sql);
          if (falharConsulta) throw new Error('Falha simulada na consulta');
          if (sql.includes('WHERE LOWER(email)')) {
            return binds.email === pessoa.email ? [{ ...pessoa, senha_hash: hash, campo_privado: 'interno' }] : [];
          }
          if (sql.includes('WHERE id = :id')) return binds.id === pessoa.id ? [pessoa] : [];
          if (sql.includes('FROM usuarios ORDER BY nome') || sql.includes('FROM usuarios u')) return [pessoa];
          return [];
        },
        async close() { estado.fechadas++; }
      };
    }
  };
}

function appMemoria() {
  const app = express();
  app.use(express.json());
  registrarLogin(app);
  registrarUsuarios(app);
  return app;
}

async function cliente(t, app) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  return {
    login(dados) {
      return fetch(base + '/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
      });
    },
    listar(token) {
      return fetch(base + '/usuarios', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    }
  };
}

test('Reunião 4: GET /usuarios retorna os três perfis sem senhas', async t => {
  const api = await cliente(t, appMemoria());
  const resposta = await api.listar();
  assert.equal(resposta.status, 200);
  const usuarios = await resposta.json();
  assert.equal(usuarios.length, 3);
  assert.deepEqual(usuarios.map(pessoa => pessoa.perfil), ['ADMIN', 'LIDER', 'MEMBRO']);
  for (const pessoa of usuarios) {
    assert.deepEqual(Object.keys(pessoa).sort(), ['email', 'id', 'nome', 'perfil']);
  }
});

test('Reunião 4: POST /login confere o array e retorna usuário e perfil sem senha', async t => {
  const api = await cliente(t, appMemoria());
  for (const [email, perfil] of [
    ['admin@local.test', 'ADMIN'], ['ana.lider@local.test', 'LIDER'], ['carla.membro@local.test', 'MEMBRO']
  ]) {
    const resposta = await api.login({ email: '  ' + email.toUpperCase() + '  ', senha: 'demo-pi2-2026' });
    assert.equal(resposta.status, 200);
    const sessao = await resposta.json();
    assert.equal(sessao.usuario.email, email);
    assert.equal(sessao.usuario.perfil, perfil);
    assert.deepEqual(Object.keys(sessao.usuario).sort(), ['email', 'id', 'nome', 'perfil']);
    assert.equal('token' in sessao, false, 'a etapa em memória não implementa uma sessão de banco');
  }
});

for (const etapa of ['memória', 'banco']) {
  function criarApp(banco) {
    return etapa === 'memória' ? appMemoria() : createApp(banco, { sessionSecret: 'segredo-do-teste-de-login' });
  }

  test(`Login com ${etapa}: campos ausentes, vazios ou de tipos inválidos retornam 400`, async t => {
    const banco = bancoTeste();
    const api = await cliente(t, criarApp(banco));
    const entradas = [
      {}, { email: usuario.email }, { senha }, { email: null, senha },
      { email: '', senha }, { email: '   ', senha }, { email: usuario.email, senha: '   ' },
      { email: 123, senha }, { email: {}, senha }, { email: [usuario.email], senha },
      { email: usuario.email, senha: 123 }, { email: usuario.email, senha: {} }
    ];
    for (const dados of entradas) {
      const resposta = await api.login(dados);
      assert.equal(resposta.status, 400, JSON.stringify(dados));
      assert.equal(typeof (await resposta.json()).error, 'string');
    }
    assert.equal(banco.estado.abertas, 0, 'rejeita dados inválidos antes de consultar o banco');
  });

  test(`Login com ${etapa}: credenciais incorretas retornam 401 sem dados do usuário`, async t => {
    const banco = bancoTeste();
    const api = await cliente(t, criarApp(banco));
    const email = etapa === 'memória' ? 'admin@local.test' : usuario.email;
    for (const dados of [{ email, senha: 'incorreta' }, { email: 'desconhecido@local.test', senha }]) {
      const resposta = await api.login(dados);
      assert.equal(resposta.status, 401);
      assert.deepEqual(await resposta.json(), { error: 'E-mail ou senha inválidos.' });
    }
    assert.equal(banco.estado.abertas, banco.estado.fechadas);
  });
}

test('Reunião 5: login gera uma sessão válida e GET /usuarios continua protegido', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  assert.equal((await api.listar()).status, 401);
  const resposta = await api.login({ email: ' LOGIN@LOCAL.TEST ', senha });
  assert.equal(resposta.status, 200);
  const sessao = await resposta.json();
  assert.deepEqual(sessao.usuario, usuario);
  assert.equal(typeof sessao.token, 'string');
  const listagem = await api.listar(sessao.token);
  assert.equal(listagem.status, 200);
  assert.deepEqual(await listagem.json(), [usuario]);
  assert.equal((await api.listar(sessao.token + 'invalido')).status, 401);
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

test('Reunião 5: listagem de membro mantém o filtro por equipes', async t => {
  const banco = bancoTeste({ perfil: 'MEMBRO' });
  const api = await cliente(t, createApp(banco));
  const sessao = await (await api.login({ email: usuario.email, senha })).json();
  const resposta = await api.listar(sessao.token);
  assert.equal(resposta.status, 200);
  assert.equal((await resposta.json())[0].perfil, 'MEMBRO');
  assert.ok(banco.estado.consultas.some(sql => sql.includes('JOIN projeto_membros')));
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

test('Erro de consulta no login devolve a conexão e retorna mensagem sem dados internos', async t => {
  t.mock.method(console, 'error', () => {});
  const banco = bancoTeste({ falharConsulta: true });
  const api = await cliente(t, createApp(banco));
  const resposta = await api.login({ email: usuario.email, senha });
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: 'Erro ao realizar login.' });
  assert.equal(banco.estado.abertas, 1);
  assert.equal(banco.estado.fechadas, 1);
});

test('Erro de consulta na listagem devolve a conexão e retorna JSON 500', async t => {
  t.mock.method(console, 'error', () => {});
  const banco = bancoTeste({ falharConsulta: true });
  const api = await cliente(t, createApp(banco, { skipAuthorization: true }));
  const resposta = await api.listar();
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: 'Erro ao listar usuários.' });
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

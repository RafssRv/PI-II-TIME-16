// Autora: Sophia Franco de Godoy / RA: 24000833
// Verifica login, cookie, consulta de sessão, logout e permissões da Aula 11.
require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createApp: buildApp } = require('../src/app');

const senha = 'SenhaTeste123!';
const hash = bcrypt.hashSync(senha, 4);
const usuario = { id: 9, nome: 'Pessoa de teste', email: 'login@local.test', perfil: 'ADMIN' };
const segredo = 'segredo-exclusivo-dos-testes-de-autenticacao';

function createApp(banco, opcoes = {}) {
  return buildApp(banco, { sessionSecret: segredo, ...opcoes });
}

function bancoTeste({ perfil = 'ADMIN', falharConsulta = false } = {}) {
  const pessoa = { ...usuario, perfil };
  const estado = { abertas: 0, fechadas: 0, consultas: [], pessoa };
  return {
    estado,
    async connection() {
      estado.abertas++;
      return {
        async query(sql, binds = {}) {
          estado.consultas.push(sql);
          if (falharConsulta || estado.falharConsulta) throw new Error('Falha simulada na consulta');
          if (estado.falharListagem && (sql.includes('FROM usuarios ORDER BY nome') || sql.includes('FROM usuarios u'))) {
            throw new Error('Falha simulada na listagem');
          }
          if (sql.includes('WHERE LOWER(email)')) {
            return binds.email === pessoa.email && pessoa.ativo !== 0 ? [{ ...pessoa, senha_hash: hash, campo_privado: 'interno' }] : [];
          }
          if (sql.includes('WHERE id = :id')) return binds.id === pessoa.id && pessoa.ativo !== 0 ? [pessoa] : [];
          if (sql.includes('FROM usuarios ORDER BY nome') || sql.includes('FROM usuarios u')) return [pessoa];
          return [];
        },
        async close() { estado.fechadas++; }
      };
    }
  };
}

async function cliente(t, app) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  let cookie = '';
  async function requisitar(caminho, opcoes = {}, cookieEnviado = cookie) {
    const headers = { ...opcoes.headers };
    if (cookieEnviado) headers.Cookie = cookieEnviado;
    const resposta = await fetch(base + caminho, { ...opcoes, headers });
    const cookies = resposta.headers.getSetCookie();
    if (cookies.length) cookie = cookies[0].split(';')[0];
    return resposta;
  }
  return {
    get cookie() { return cookie; },
    requisitar,
    login(dados) {
      return requisitar('/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
      });
    },
    listar(cookieEnviado = cookie) {
      return requisitar('/usuarios', {}, cookieEnviado);
    },
    sessao() { return requisitar('/sessao'); },
    logout() { return requisitar('/logout', { method: 'POST' }); },
    pagina(nome) {
      return fetch(`http://127.0.0.1:${servidor.address().port}/frontend/html/${nome}`, {
        headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual'
      });
    }
  };
}

test('Login com banco: campos ausentes, vazios ou de tipos inválidos retornam 400', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
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

test('Login com banco: credenciais incorretas retornam 401 sem dados do usuário', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  const email = usuario.email;
  for (const dados of [{ email, senha: 'incorreta' }, { email: 'desconhecido@local.test', senha }]) {
    const resposta = await api.login(dados);
    assert.equal(resposta.status, 401);
    assert.deepEqual(await resposta.json(), { error: 'E-mail ou senha inválidos.' });
  }
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

test('Aula 11: login cria cookie HttpOnly e GET /usuarios continua protegido', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  assert.equal((await api.listar()).status, 401);
  const resposta = await api.login({ email: ' LOGIN@LOCAL.TEST ', senha });
  assert.equal(resposta.status, 200);
  const sessao = await resposta.json();
  assert.deepEqual(sessao, usuario);
  assert.equal('token' in sessao, false);
  const cookie = resposta.headers.getSetCookie()[0];
  assert.match(cookie, /^portal\.sid=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.doesNotMatch(cookie, /; Secure/i);
  const validade = new Date(cookie.match(/Expires=([^;]+)/i)[1]).getTime() - Date.now();
  assert.ok(validade > 29 * 60 * 1000 && validade <= 30 * 60 * 1000);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await (await api.sessao()).json(), usuario);
  const listagem = await api.listar();
  assert.equal(listagem.status, 200);
  assert.deepEqual(await listagem.json(), [usuario]);
  assert.equal((await api.listar(api.cookie + 'invalido')).status, 401);
  assert.equal((await api.listar('')).status, 401);
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

test('Reunião 5: listagem de membro mantém o filtro por equipes', async t => {
  const banco = bancoTeste({ perfil: 'MEMBRO' });
  const api = await cliente(t, createApp(banco));
  await (await api.login({ email: usuario.email, senha })).json();
  const resposta = await api.listar();
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
  assert.deepEqual(await resposta.json(), { error: 'Erro interno ao acessar o banco.' });
  assert.equal(banco.estado.abertas, 1);
  assert.equal(banco.estado.fechadas, 1);
});

test('Erro de consulta na listagem devolve a conexão e retorna JSON 500', async t => {
  t.mock.method(console, 'error', () => {});
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  assert.equal((await api.login({ email: usuario.email, senha })).status, 200);
  banco.estado.falharListagem = true;
  const resposta = await api.listar();
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: 'Erro ao listar usuários.' });
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

test('Aula 11: sessão não autenticada não gera cookie nem aceita Bearer antigo', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  const resposta = await api.requisitar('/sessao', { headers: { Authorization: 'Bearer token-antigo' } });
  assert.equal(resposta.status, 401);
  assert.deepEqual(resposta.headers.getSetCookie(), []);
  assert.equal(banco.estado.abertas, 0);
});

test('Aula 11: novo login regenera o identificador e invalida a sessão anterior', async t => {
  const api = await cliente(t, createApp(bancoTeste()));
  await (await api.login({ email: usuario.email, senha })).json();
  const anterior = api.cookie;
  await (await api.login({ email: usuario.email, senha })).json();
  assert.notEqual(api.cookie, anterior);
  assert.equal((await api.listar(anterior)).status, 401);
  assert.equal((await api.sessao()).status, 200);
});

test('Aula 11: logout destrói a sessão e rejeita a reutilização do cookie', async t => {
  const api = await cliente(t, createApp(bancoTeste()));
  await (await api.login({ email: usuario.email, senha })).json();
  const anterior = api.cookie;
  const resposta = await api.logout();
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { mensagem: 'Sessão encerrada.' });
  assert.match(resposta.headers.getSetCookie()[0], /^portal\.sid=;/);
  assert.equal((await api.sessao()).status, 401);
  assert.equal((await api.listar(anterior)).status, 401);
  assert.equal((await api.logout()).status, 401);
});

test('Aula 11: sessões em memória não sobrevivem a outra instância do servidor', async t => {
  const banco = bancoTeste();
  const primeira = await cliente(t, createApp(banco));
  await (await primeira.login({ email: usuario.email, senha })).json();
  const segunda = await cliente(t, createApp(banco));
  assert.equal((await segunda.listar(primeira.cookie)).status, 401);
});

test('Logout encerra a sessão mesmo quando o banco está indisponível', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  await (await api.login({ email: usuario.email, senha })).json();
  banco.estado.falharConsulta = true;
  assert.equal((await api.logout()).status, 200);
  assert.equal((await api.sessao()).status, 401);
  assert.equal(banco.estado.abertas, 1);
});

test('Aula 11: origem externa não pode fazer login nem encerrar uma sessão válida', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  const resposta = await api.requisitar('/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://outro-site.invalid' },
    body: JSON.stringify({ email: usuario.email, senha })
  });
  assert.equal(resposta.status, 403);
  assert.equal(banco.estado.abertas, 0);
  await (await api.login({ email: usuario.email, senha })).json();
  assert.equal((await api.requisitar('/logout', { method: 'POST', headers: { Origin: 'https://outro-site.invalid' } })).status, 403);
  assert.equal((await api.sessao()).status, 200);
});

test('Aula 11: páginas internas exigem sessão antes de entregar o HTML', async t => {
  const api = await cliente(t, createApp(bancoTeste()));
  for (const nome of ['dashboard.html', 'listagemDemandas.html', 'cadastro.html', 'detalhes.html', 'projetos.html', 'administracao.html']) {
    const resposta = await api.pagina(nome);
    assert.equal(resposta.status, 302, nome);
    assert.equal(resposta.headers.get('location'), '/frontend/html/login.html');
  }
  assert.equal((await api.pagina('login.html')).status, 200);
  await (await api.login({ email: usuario.email, senha })).json();
  assert.equal((await api.pagina('dashboard.html')).status, 200);
});

for (const perfil of ['ADMIN', 'LIDER', 'MEMBRO']) {
  test(`Aula 11 e escopo: perfil ${perfil} vem do banco e controla as páginas e operações`, async t => {
    const banco = bancoTeste({ perfil });
    const api = await cliente(t, createApp(banco));
    const resposta = await api.login({ email: usuario.email, senha, perfil: 'ADMIN' });
    assert.equal((await resposta.json()).perfil, perfil);
    assert.equal((await (await api.sessao()).json()).perfil, perfil);
    assert.equal((await api.pagina('administracao.html')).status, perfil === 'ADMIN' ? 200 : 302);
    assert.equal((await api.pagina('cadastro.html')).status, perfil === 'MEMBRO' ? 302 : 200);
    if (perfil !== 'ADMIN') {
      assert.equal((await api.requisitar('/usuarios/1', { method: 'DELETE' })).status, 403);
      assert.equal((await api.requisitar('/usuarios/1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Teste' }) })).status, 403);
    }
    assert.equal(banco.estado.abertas, banco.estado.fechadas);
  });
}

test('Conta desativada perde acesso mesmo com um cookie que antes era válido', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  await (await api.login({ email: usuario.email, senha })).json();
  banco.estado.pessoa.ativo = 0;
  assert.equal((await api.sessao()).status, 401);
  assert.equal((await api.login({ email: usuario.email, senha })).status, 401);
  assert.equal(banco.estado.abertas, banco.estado.fechadas);
});

test('Alterações de perfil no banco continuam sendo verificadas antes de autorizar operações', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  await (await api.login({ email: usuario.email, senha })).json();
  banco.estado.pessoa.perfil = 'MEMBRO';
  assert.equal((await (await api.sessao()).json()).perfil, 'MEMBRO');
  assert.equal((await api.requisitar('/usuarios/1', { method: 'DELETE' })).status, 403);
});

test('Aula 11: senha que excede 72 bytes é rejeitada antes de consultar o banco', async t => {
  const banco = bancoTeste();
  const api = await cliente(t, createApp(banco));
  for (const senhaLonga of ['a'.repeat(73), 'á'.repeat(37)]) {
    assert.equal((await api.login({ email: usuario.email, senha: senhaLonga })).status, 400);
  }
  assert.equal(banco.estado.abertas, 0);
});

test('Aula 11: configuração exige segredo válido antes de iniciar o servidor', () => {
  for (const sessionSecret of ['', 'curto', 'SUBSTITUA_POR_UMA_CHAVE_ALEATORIA_DE_32_CARACTERES']) {
    assert.throws(() => buildApp(bancoTeste(), { sessionSecret }), /SESSION_SECRET/);
  }
});

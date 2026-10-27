const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { isNationalHoliday } = require('./holidays');

// Integração: Vinicius Panutti Salgado — R.A. 25007329.
// As ações de cadastro/login existentes são mantidas; regras abaixo tratam consultas e edição.
const ENUMS = {
  status: ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'],
  prioridade: ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'],
  tipo: ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO']
};
const TRANSICOES = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['EM_REVISAO', 'CANCELADA'],
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [], CANCELADA: []
};
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
function texto(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw badRequest(`${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return value.trim();
}
function dataCivil(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest('Prazo inválido: use AAAA-MM-DD.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1000-01-01') throw badRequest('Prazo inválido.');
  return value;
}
function hojeCivil(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function required(body, names) {
  for (const name of names) {
    if (body[name] === undefined || body[name] === null || String(body[name]).trim() === '') {
      throw Object.assign(new Error(`Campo obrigatório: ${name}`), { status: 400 });
    }
  }
}
const notFound = (name) => Object.assign(new Error(`${name} não encontrado.`), { status: 404 });
function parseId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new Error('Identificador inválido.'), { status: 400 });
  return parsed;
}
async function useConnection(database, work) {
  const connection = await database.connection();
  try { return await work(connection); } finally { await connection.close(); }
}

function createApp(database, { isHoliday = isNationalHoliday, now = () => new Date() } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
  app.get('/', (_req, res) => res.redirect('/frontend/html/login.html'));

  app.get('/api/health', async (_req, res, next) => {
    try { await useConnection(database, (c) => c.query('SELECT 1 AS ok')); res.json({ database: 'online' }); }
    catch (error) { next(Object.assign(error, { status: 503 })); }
  });

  app.post('/api/login', async (req, res, next) => {
    try {
      required(req.body, ['email', 'senha']);
      const users = await useConnection(database, (c) => c.query('SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1', { email: req.body.email.trim() }));
      if (!users.length || !(await bcrypt.compare(req.body.senha, users[0].senha_hash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      const { senha_hash, ...user } = users[0];
      res.json(user);
    } catch (error) { next(error); }
  });

  app.get('/api/usuarios', async (_req, res, next) => {
    try { res.json(await useConnection(database, (c) => c.query('SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios ORDER BY nome'))); }
    catch (error) { next(error); }
  });
  app.post('/api/usuarios', async (req, res, next) => {
    try {
      required(req.body, ['nome', 'email', 'senha', 'perfil']);
      const senha_hash = await bcrypt.hash(req.body.senha, 12);
      const userId = await useConnection(database, async (c) => {
        const result = await c.execute('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)', { nome: req.body.nome.trim(), email: req.body.email.trim().toLowerCase(), senha_hash, perfil: req.body.perfil });
        await c.commit(); return result.insertId;
      });
      res.status(201).json({ id: userId });
    } catch (error) { next(error); }
  });
  app.patch('/api/usuarios/:id', async (req, res, next) => {
    try {
      const allowed = ['nome', 'email', 'perfil', 'ativo'];
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => {
        const binds = Object.fromEntries(changes.map((key) => [key, req.body[key]])); binds.id = parseId(req.params.id);
        const result = await c.execute(`UPDATE usuarios SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`, binds);
        if (!result.affectedRows) throw notFound('Usuário'); await c.commit();
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/usuarios/:id', async (req, res, next) => {
    try {
      await useConnection(database, async (c) => { const result = await c.execute('UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id', { id: parseId(req.params.id) }); if (!result.affectedRows) throw notFound('Usuário'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/projetos', async (_req, res, next) => {
    try { res.json(await useConnection(database, (c) => c.query('SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM projetos ORDER BY nome'))); }
    catch (error) { next(error); }
  });
  app.post('/api/projetos', async (req, res, next) => {
    try {
      required(req.body, ['nome']);
      const projectId = await useConnection(database, async (c) => { const result = await c.execute('INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao)', { nome: req.body.nome.trim(), descricao: req.body.descricao || null }); await c.commit(); return result.insertId; });
      res.status(201).json({ id: projectId });
    } catch (error) { next(error); }
  });
  app.patch('/api/projetos/:id', async (req, res, next) => {
    try {
      const allowed = ['nome', 'descricao', 'ativo'];
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => { const binds = Object.fromEntries(changes.map((key) => [key, req.body[key]])); binds.id = parseId(req.params.id); const result = await c.execute(`UPDATE projetos SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`, binds); if (!result.affectedRows) throw notFound('Projeto'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/projetos/:id', async (req, res, next) => {
    try { await useConnection(database, async (c) => { const result = await c.execute('UPDATE projetos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id', { id: parseId(req.params.id) }); if (!result.affectedRows) throw notFound('Projeto'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.post('/api/projetos/:id/membros', async (req, res, next) => {
    try { required(req.body, ['usuario_id']); await useConnection(database, async (c) => { await c.execute('INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)', { projeto_id: parseId(req.params.id), usuario_id: req.body.usuario_id }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.get('/api/projetos/:id/membros', async (req, res, next) => {
    try { res.json(await useConnection(database, (c) => c.query('SELECT u.id, u.nome, u.email, u.perfil FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id ORDER BY u.nome', { projeto_id: parseId(req.params.id) }))); }
    catch (error) { next(error); }
  });
  app.delete('/api/projetos/:projetoId/membros/:usuarioId', async (req, res, next) => {
    try { await useConnection(database, async (c) => { await c.execute('DELETE FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id', { projeto_id: parseId(req.params.projetoId), usuario_id: parseId(req.params.usuarioId) }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });

  app.get('/api/demandas', async (req, res, next) => {
    try {
      const binds = {}; const filters = [];
      for (const field of ['status', 'prioridade', 'tipo', 'projeto_id', 'responsavel_id', 'busca', 'ordenacao']) {
        if (req.query[field] !== undefined && typeof req.query[field] !== 'string') throw badRequest(`Filtro inválido: ${field}.`);
      }
      for (const field of ['status', 'prioridade', 'tipo']) if (req.query[field]) {
        if (!ENUMS[field].includes(req.query[field])) throw badRequest(`Filtro inválido: ${field}.`);
        filters.push(`d.${field} = :${field}`); binds[field] = req.query[field];
      }
      for (const field of ['projeto_id', 'responsavel_id']) if (req.query[field]) {
        filters.push(`d.${field} = :${field}`); binds[field] = parseId(req.query[field]);
      }
      if (req.query.busca) { filters.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)'); binds.busca = `%${req.query.busca.toLowerCase()}%`; }
      // Somente expressões fixas entram no ORDER BY; valores do cliente ficam em binds.
      const orders = {
        criacao_desc: 'd.criado_em DESC, d.id DESC',
        prazo_asc: 'd.prazo IS NULL, d.prazo ASC, d.id DESC',
        prioridade_desc: "FIELD(d.prioridade, 'CRITICA', 'ALTA', 'MEDIA', 'BAIXA'), d.id DESC",
        status: "FIELD(d.status, 'ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'), d.id DESC"
      };
      const order = req.query.ordenacao || 'criacao_desc';
      if (!Object.hasOwn(orders, order)) throw badRequest('Ordenação inválida.');
      const sql = `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY ${orders[order]}`;
      res.json(await useConnection(database, (c) => c.query(sql, binds)));
    } catch (error) { next(error); }
  });

  app.get('/api/dashboard', async (_req, res, next) => {
    try {
      const demandas = await useConnection(database, (c) => c.query('SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id ORDER BY d.prazo IS NULL, d.prazo, d.id'));
      const hoje = hojeCivil(now());
      const limite = new Date(`${hoje}T00:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 7);
      const ultimoDia = limite.toISOString().slice(0, 10);
      const contar = (campo) => Object.fromEntries(ENUMS[campo].map((value) => [value, demandas.filter((d) => d[campo] === value).length]));
      const emAberto = demandas.filter((d) => !['CONCLUIDA', 'CANCELADA'].includes(d.status));
      res.json({
        totalDemandas: demandas.length,
        quantidadesPorStatus: contar('status'), quantidadesPorPrioridade: contar('prioridade'), quantidadesPorTipo: contar('tipo'),
        demandasCriticasEmAberto: emAberto.filter((d) => d.prioridade === 'CRITICA'),
        demandasProximasDoPrazo: emAberto.filter((d) => d.prazo && d.prazo >= hoje && d.prazo <= ultimoDia)
      });
    } catch (error) { next(error); }
  });
  // URLs antigas apontam para a mesma persistência, sem manter cópias em memória.
  app.use('/dashboard', (req, res) => res.redirect(307, `/api/dashboard${req.url === '/' ? '' : req.url}`));
  app.use('/demandas', (req, res) => res.redirect(307, `/api/demandas${req.url === '/' ? '' : req.url}`));

  app.get('/api/demandas/:id', async (req, res, next) => {
    try {
      const demandId = parseId(req.params.id);
      const data = await useConnection(database, async (c) => {
        const rows = await c.query('SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id WHERE d.id = :id', { id: demandId });
        if (!rows.length) throw notFound('Demanda');
        const comentarios = await c.query('SELECT c.*, u.nome AS autor_nome FROM comentarios c JOIN usuarios u ON u.id = c.autor_id WHERE c.demanda_id = :id ORDER BY c.criado_em', { id: demandId });
        const historico = await c.query('SELECT h.*, u.nome AS autor_nome FROM historico_demandas h JOIN usuarios u ON u.id = h.autor_id WHERE h.demanda_id = :id ORDER BY h.criado_em', { id: demandId });
        return { ...rows[0], comentarios, historico };
      });
      res.json(data);
    } catch (error) { next(error); }
  });
  app.post('/api/demandas', async (req, res, next) => {
    try {
      required(req.body, ['projeto_id', 'criador_id', 'titulo', 'descricao', 'tipo', 'prioridade']);
      const demandId = await useConnection(database, async (c) => {
        try {
          const result = await c.execute('INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo) VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo)', { projeto_id: req.body.projeto_id, criador_id: req.body.criador_id, responsavel_id: req.body.responsavel_id || null, titulo: req.body.titulo.trim(), descricao: req.body.descricao.trim(), tipo: req.body.tipo, prioridade: req.body.prioridade, prazo: req.body.prazo ? new Date(`${req.body.prazo}T00:00:00`) : null });
          const createdId = result.insertId;
          await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo) VALUES (:id, :autor_id, 'CRIACAO', :titulo)", { id: createdId, autor_id: req.body.criador_id, titulo: req.body.titulo.trim() });
          await c.commit(); return createdId;
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(201).json({ id: demandId });
    } catch (error) { next(error); }
  });
  app.patch('/api/demandas/:id', async (req, res, next) => {
    try {
      const allowed = ['titulo', 'descricao', 'tipo', 'prioridade', 'status', 'prazo', 'responsavel_id'];
      required(req.body || {}, ['autor_id']);
      const autorId = parseId(req.body.autor_id);
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw badRequest('Nenhum campo permitido informado.');
      const values = {};
      for (const field of changes) {
        const value = req.body[field];
        if (field === 'titulo') values[field] = texto(value, 'Título', 3, 100);
        else if (field === 'descricao') values[field] = texto(value, 'Descrição', 10, 1000);
        else if (ENUMS[field]) {
          if (!ENUMS[field].includes(value)) throw badRequest(`Valor inválido: ${field}.`);
          values[field] = value;
        } else if (field === 'responsavel_id') values[field] = value === null || value === '' ? null : parseId(value);
        else if (field === 'prazo') {
          values[field] = dataCivil(value);
          if (values[field] && values[field] < hojeCivil(now())) throw badRequest('O prazo não pode estar no passado.');
          if (values[field] && await isHoliday(values[field])) throw badRequest('O prazo não pode cair em um feriado nacional.');
        }
      }
      await useConnection(database, async (c) => {
        try {
          const demandId = parseId(req.params.id);
          const rows = await c.query('SELECT * FROM demandas WHERE id = :id FOR UPDATE', { id: demandId });
          if (!rows.length) throw notFound('Demanda');
          if (values.status && values.status !== rows[0].status && !TRANSICOES[rows[0].status]?.includes(values.status)) throw badRequest('Transição de status inválida. Siga o ciclo Aberta → Em andamento → Em revisão → Concluída.');
          if (values.responsavel_id) {
            const membros = await c.query('SELECT u.id FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1', { projeto_id: rows[0].projeto_id, usuario_id: values.responsavel_id });
            if (!membros.length) throw badRequest('O responsável deve ser um usuário ativo vinculado ao projeto.');
          }
          const actualChanges = changes.filter((field) => String(rows[0][field] ?? '') !== String(values[field] ?? ''));
          if (actualChanges.length) {
            const binds = Object.fromEntries(actualChanges.map((field) => [field, values[field]])); binds.id = demandId;
            await c.execute(`UPDATE demandas SET ${actualChanges.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`, binds);
            for (const campo of actualChanges) await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo) VALUES (:id, :autor_id, 'ALTERACAO', :campo, :anterior, :novo)", { id: demandId, autor_id: autorId, campo, anterior: rows[0][campo] == null ? null : String(rows[0][campo]), novo: values[campo] == null ? null : String(values[campo]) });
          }
          await c.commit();
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/demandas/:id', (_req, res) => {
    res.set('Allow', 'GET, PATCH').status(405).json({ error: 'Demandas não podem ser excluídas. Altere o status para CANCELADA para preservar o histórico.' });
  });
  app.post('/api/demandas/:id/comentarios', async (req, res, next) => {
    try {
      required(req.body || {}, ['autor_id', 'texto']);
      texto(req.body.texto, 'Comentário', 3, 500);
      parseId(req.body.autor_id);
      const commentId = await useConnection(database, async (c) => { const result = await c.execute('INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto)', { demanda_id: parseId(req.params.id), autor_id: req.body.autor_id, texto: req.body.texto.trim() }); await c.commit(); return result.insertId; });
      res.status(201).json({ id: commentId });
    } catch (error) { next(error); }
  });
  app.patch('/api/comentarios/:id', async (req, res, next) => {
    try { required(req.body || {}, ['texto']); texto(req.body.texto, 'Comentário', 3, 500); await useConnection(database, async (c) => { const result = await c.execute('UPDATE comentarios SET texto = :texto, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id', { texto: req.body.texto.trim(), id: parseId(req.params.id) }); if (!result.affectedRows) throw notFound('Comentário'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.delete('/api/comentarios/:id', async (req, res, next) => {
    try { await useConnection(database, async (c) => { const result = await c.execute('DELETE FROM comentarios WHERE id = :id', { id: parseId(req.params.id) }); if (!result.affectedRows) throw notFound('Comentário'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use((error, _req, res, _next) => {
    const invalidData = ['ER_NO_REFERENCED_ROW_2', 'ER_CHECK_CONSTRAINT_VIOLATED', 'ER_DATA_TOO_LONG', 'ER_BAD_NULL_ERROR', 'ER_TRUNCATED_WRONG_VALUE'];
    const status = error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : invalidData.includes(error.code) ? 400 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? (error.publicMessage || 'Erro interno ao acessar o banco.') : invalidData.includes(error.code) ? 'Dados inválidos ou referência inexistente.' : error.message });
  });
  return app;
}

module.exports = { createApp };

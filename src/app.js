const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const oracledb = require('oracledb');

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
const outputId = () => ({ dir: oracledb.BIND_OUT, type: oracledb.NUMBER });

function createApp(database) {
  const app = express();
  app.use(express.json());
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
  app.get('/', (_req, res) => res.redirect('/frontend/html/login.html'));

  app.get('/api/health', async (_req, res, next) => {
    try { await useConnection(database, (c) => c.query('SELECT 1 AS ok FROM dual')); res.json({ database: 'online' }); }
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
        const result = await c.execute('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil) RETURNING id INTO :id', { nome: req.body.nome.trim(), email: req.body.email.trim().toLowerCase(), senha_hash, perfil: req.body.perfil, id: outputId() });
        await c.commit(); return result.outBinds.id[0];
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
        const result = await c.execute(`UPDATE usuarios SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = SYSTIMESTAMP WHERE id = :id`, binds);
        if (!result.rowsAffected) throw notFound('Usuário'); await c.commit();
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/usuarios/:id', async (req, res, next) => {
    try {
      await useConnection(database, async (c) => { const result = await c.execute('UPDATE usuarios SET ativo = 0, atualizado_em = SYSTIMESTAMP WHERE id = :id', { id: parseId(req.params.id) }); if (!result.rowsAffected) throw notFound('Usuário'); await c.commit(); });
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
      const projectId = await useConnection(database, async (c) => { const result = await c.execute('INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao) RETURNING id INTO :id', { nome: req.body.nome.trim(), descricao: req.body.descricao || null, id: outputId() }); await c.commit(); return result.outBinds.id[0]; });
      res.status(201).json({ id: projectId });
    } catch (error) { next(error); }
  });
  app.patch('/api/projetos/:id', async (req, res, next) => {
    try {
      const allowed = ['nome', 'descricao', 'ativo'];
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => { const binds = Object.fromEntries(changes.map((key) => [key, req.body[key]])); binds.id = parseId(req.params.id); const result = await c.execute(`UPDATE projetos SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = SYSTIMESTAMP WHERE id = :id`, binds); if (!result.rowsAffected) throw notFound('Projeto'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/projetos/:id', async (req, res, next) => {
    try { await useConnection(database, async (c) => { const result = await c.execute('UPDATE projetos SET ativo = 0, atualizado_em = SYSTIMESTAMP WHERE id = :id', { id: parseId(req.params.id) }); if (!result.rowsAffected) throw notFound('Projeto'); await c.commit(); }); res.status(204).end(); }
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
      for (const field of ['status', 'prioridade']) if (req.query[field]) { filters.push(`d.${field} = :${field}`); binds[field] = req.query[field]; }
      if (req.query.busca) { filters.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)'); binds.busca = `%${req.query.busca.toLowerCase()}%`; }
      const sql = `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY d.criado_em DESC`;
      res.json(await useConnection(database, (c) => c.query(sql, binds)));
    } catch (error) { next(error); }
  });
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
          const result = await c.execute('INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo) VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo) RETURNING id INTO :id', { projeto_id: req.body.projeto_id, criador_id: req.body.criador_id, responsavel_id: req.body.responsavel_id || null, titulo: req.body.titulo.trim(), descricao: req.body.descricao.trim(), tipo: req.body.tipo, prioridade: req.body.prioridade, prazo: req.body.prazo ? new Date(`${req.body.prazo}T00:00:00`) : null, id: outputId() });
          const createdId = result.outBinds.id[0];
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
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      required(req.body, ['autor_id']);
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => {
        try {
          const demandId = parseId(req.params.id);
          const rows = await c.query('SELECT * FROM demandas WHERE id = :id FOR UPDATE', { id: demandId });
          if (!rows.length) throw notFound('Demanda');
          const binds = Object.fromEntries(changes.map((key) => [key, key === 'prazo' && req.body[key] ? new Date(`${req.body[key]}T00:00:00`) : req.body[key]])); binds.id = demandId;
          await c.execute(`UPDATE demandas SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = SYSTIMESTAMP WHERE id = :id`, binds);
          for (const campo of changes) await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo) VALUES (:id, :autor_id, 'ALTERACAO', :campo, :anterior, :novo)", { id: demandId, autor_id: req.body.autor_id, campo, anterior: rows[0][campo] == null ? null : String(rows[0][campo]), novo: req.body[campo] == null ? null : String(req.body[campo]) });
          await c.commit();
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/demandas/:id', async (req, res, next) => {
    try {
      await useConnection(database, async (c) => {
        try {
          const demandId = parseId(req.params.id);
          await c.execute('DELETE FROM comentarios WHERE demanda_id = :id', { id: demandId });
          await c.execute('DELETE FROM historico_demandas WHERE demanda_id = :id', { id: demandId });
          const result = await c.execute('DELETE FROM demandas WHERE id = :id', { id: demandId });
          if (!result.rowsAffected) throw notFound('Demanda');
          await c.commit();
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.post('/api/demandas/:id/comentarios', async (req, res, next) => {
    try {
      required(req.body, ['autor_id', 'texto']);
      const commentId = await useConnection(database, async (c) => { const result = await c.execute('INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto) RETURNING id INTO :id', { demanda_id: parseId(req.params.id), autor_id: req.body.autor_id, texto: req.body.texto.trim(), id: outputId() }); await c.commit(); return result.outBinds.id[0]; });
      res.status(201).json({ id: commentId });
    } catch (error) { next(error); }
  });
  app.patch('/api/comentarios/:id', async (req, res, next) => {
    try { required(req.body, ['texto']); await useConnection(database, async (c) => { const result = await c.execute('UPDATE comentarios SET texto = :texto, atualizado_em = SYSTIMESTAMP WHERE id = :id', { texto: req.body.texto.trim(), id: parseId(req.params.id) }); if (!result.rowsAffected) throw notFound('Comentário'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.delete('/api/comentarios/:id', async (req, res, next) => {
    try { await useConnection(database, async (c) => { const result = await c.execute('DELETE FROM comentarios WHERE id = :id', { id: parseId(req.params.id) }); if (!result.rowsAffected) throw notFound('Comentário'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || (error.errorNum === 1 ? 409 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Erro interno ao acessar o banco.' : error.message });
  });
  return app;
}

module.exports = { createApp };

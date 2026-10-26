// Autor: Equipe PI-II-TIME-16
// Descrição: API principal, autenticação e regras de acesso do sistema de demandas.

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const oracledb = require('oracledb');
const { isNationalHoliday } = require('./holidays');

const STATUS_DEMANDA = ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'];
const PRIORIDADES = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
const TIPOS = ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO'];
const TRANSICOES_STATUS = {
  ABERTA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['EM_REVISAO'],
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA'],
  CONCLUIDA: [],
  CANCELADA: []
};

function required(body, names) {
  for (const name of names) {
    const value = body && typeof body === 'object' ? body[name] : undefined;
    if (value === undefined || value === null || String(value).trim() === '') {
      throw Object.assign(new Error(`Campo obrigatório: ${name}`), { status: 400 });
    }
  }
}
const notFound = (name) => Object.assign(new Error(`${name} não encontrado.`), { status: 404 });
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const forbidden = (message) => Object.assign(new Error(message), { status: 403 });
function parseId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new Error('Identificador inválido.'), { status: 400 });
  return parsed;
}
function parseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest('O prazo deve estar no formato AAAA-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw badRequest('O prazo informado não é uma data válida.');
  }
  return value;
}
function hojeEmSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function cookieValue(req, name) {
  const header = req.headers.cookie || '';
  const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
function setSessionCookie(res, sessionId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
}
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}
function isPrivileged(user) {
  return user.perfil === 'ADMIN' || user.perfil === 'LIDER';
}
function validateText(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw badRequest(`${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return value.trim();
}
async function projetoVinculado(connection, usuario, projetoId) {
  if (usuario.perfil === 'ADMIN') return true;
  const rows = await connection.query(
    'SELECT 1 AS vinculado FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id',
    { projeto_id: projetoId, usuario_id: usuario.id }
  );
  return rows.length > 0;
}
async function verificarAcessoDemanda(connection, usuario, demanda) {
  if (usuario.perfil === 'ADMIN') return;
  const vinculado = await projetoVinculado(connection, usuario, demanda.projeto_id);
  if (usuario.perfil === 'LIDER' && !vinculado) throw notFound('Demanda');
  if (usuario.perfil === 'MEMBRO' && !vinculado && Number(demanda.responsavel_id) !== Number(usuario.id)) {
    throw notFound('Demanda');
  }
}
async function useConnection(database, work) {
  const connection = await database.connection();
  try { return await work(connection); } finally { await connection.close(); }
}
const outputId = () => ({ dir: oracledb.BIND_OUT, type: oracledb.NUMBER });

function createApp(database) {
  const app = express();
  const sessions = new Map();
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
      if (typeof req.body.email !== 'string' || typeof req.body.senha !== 'string') throw badRequest('E-mail e senha devem ser textos.');
      const users = await useConnection(database, (c) => c.query('SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1', { email: req.body.email.trim() }));
      if (!users.length || !(await bcrypt.compare(req.body.senha, users[0].senha_hash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      const { senha_hash, ...user } = users[0];
      const sessionId = crypto.randomBytes(32).toString('hex');
      sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      setSessionCookie(res, sessionId);
      res.json(user);
    } catch (error) { next(error); }
  });

  // Sessões HTTP-only identificam o usuário no servidor; IDs enviados pelo navegador não definem autoria.
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/login') return next();
    try {
      const sessionId = cookieValue(req, 'sid');
      const session = sessionId && sessions.get(sessionId);
      if (!session || session.expiresAt <= Date.now()) {
        if (sessionId) sessions.delete(sessionId);
        if (req.method === 'POST' && req.path === '/usuarios') {
          const rows = await useConnection(database, (c) => c.query('SELECT COUNT(*) AS total FROM usuarios'));
          if (Number(rows[0]?.total || 0) === 0) {
            req.bootstrapAdmin = true;
            return next();
          }
        }
        return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
      }

      const users = await useConnection(database, (c) => c.query(
        'SELECT id, nome, email, perfil FROM usuarios WHERE id = :id AND ativo = 1',
        { id: session.userId }
      ));
      if (!users.length) {
        sessions.delete(sessionId);
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Usuário inativo ou sessão inválida.' });
      }
      session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      req.authUser = users[0];
      req.sessionId = sessionId;
      next();
    } catch (error) { next(error); }
  });

  app.get('/api/me', (req, res) => res.json(req.authUser));
  app.post('/api/logout', (req, res) => {
    if (req.sessionId) sessions.delete(req.sessionId);
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get('/api/usuarios', async (req, res, next) => {
    try {
      const users = await useConnection(database, (c) => req.authUser.perfil === 'ADMIN'
        ? c.query('SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios ORDER BY nome')
        : c.query('SELECT DISTINCT u.id, u.nome, u.email, u.perfil, u.ativo, u.criado_em, u.atualizado_em FROM usuarios u JOIN projeto_membros pm ON pm.usuario_id = u.id JOIN projeto_membros mine ON mine.projeto_id = pm.projeto_id WHERE mine.usuario_id = :usuario_id AND u.ativo = 1 ORDER BY u.nome', { usuario_id: req.authUser.id }));
      res.json(users);
    }
    catch (error) { next(error); }
  });
  app.post('/api/usuarios', async (req, res, next) => {
    try {
      required(req.body, ['nome', 'email', 'senha', 'perfil']);
      if (req.bootstrapAdmin) {
        if (req.body.perfil !== 'ADMIN') throw forbidden('O primeiro usuário deve ser administrador.');
      } else if (req.authUser.perfil !== 'ADMIN') {
        throw forbidden('Somente um administrador pode cadastrar usuários.');
      }
      if (!['ADMIN', 'LIDER', 'MEMBRO'].includes(req.body.perfil)) throw badRequest('Perfil inválido.');
      const nome = validateText(req.body.nome, 'O nome', 2, 100);
      const email = validateText(req.body.email, 'O e-mail', 3, 254).toLowerCase();
      if (typeof req.body.senha !== 'string' || req.body.senha.length < 8) throw badRequest('A senha deve ter pelo menos 8 caracteres.');
      const senha_hash = await bcrypt.hash(req.body.senha, 12);
      const userId = await useConnection(database, async (c) => {
        const result = await c.execute('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil) RETURNING id INTO :id', { nome, email, senha_hash, perfil: req.body.perfil, id: outputId() });
        await c.commit(); return result.outBinds.id[0];
      });
      res.status(201).json({ id: userId });
    } catch (error) { next(error); }
  });
  app.patch('/api/usuarios/:id', async (req, res, next) => {
    try {
      if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode alterar usuários.');
      const allowed = ['nome', 'email', 'perfil', 'ativo'];
      const changes = Object.keys(req.body || {}).filter((key) => allowed.includes(key));
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
      if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode desativar usuários.');
      await useConnection(database, async (c) => { const result = await c.execute('UPDATE usuarios SET ativo = 0, atualizado_em = SYSTIMESTAMP WHERE id = :id', { id: parseId(req.params.id) }); if (!result.rowsAffected) throw notFound('Usuário'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/projetos', async (req, res, next) => {
    try {
      const projects = await useConnection(database, (c) => req.authUser.perfil === 'ADMIN'
        ? c.query('SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM projetos ORDER BY nome')
        : c.query('SELECT p.id, p.nome, p.descricao, p.ativo, p.criado_em, p.atualizado_em FROM projetos p JOIN projeto_membros pm ON pm.projeto_id = p.id WHERE pm.usuario_id = :usuario_id AND p.ativo = 1 ORDER BY p.nome', { usuario_id: req.authUser.id }));
      res.json(projects);
    }
    catch (error) { next(error); }
  });
  app.post('/api/projetos', async (req, res, next) => {
    try {
      if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode cadastrar projetos.');
      required(req.body, ['nome']);
      const projectId = await useConnection(database, async (c) => { const result = await c.execute('INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao) RETURNING id INTO :id', { nome: req.body.nome.trim(), descricao: req.body.descricao || null, id: outputId() }); await c.commit(); return result.outBinds.id[0]; });
      res.status(201).json({ id: projectId });
    } catch (error) { next(error); }
  });
  app.patch('/api/projetos/:id', async (req, res, next) => {
    try {
      if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode alterar projetos.');
      const allowed = ['nome', 'descricao', 'ativo'];
      const changes = Object.keys(req.body || {}).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => { const binds = Object.fromEntries(changes.map((key) => [key, req.body[key]])); binds.id = parseId(req.params.id); const result = await c.execute(`UPDATE projetos SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = SYSTIMESTAMP WHERE id = :id`, binds); if (!result.rowsAffected) throw notFound('Projeto'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/projetos/:id', async (req, res, next) => {
    try { if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode desativar projetos.'); await useConnection(database, async (c) => { const result = await c.execute('UPDATE projetos SET ativo = 0, atualizado_em = SYSTIMESTAMP WHERE id = :id', { id: parseId(req.params.id) }); if (!result.rowsAffected) throw notFound('Projeto'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.post('/api/projetos/:id/membros', async (req, res, next) => {
    try { if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode alterar os membros dos projetos.'); required(req.body, ['usuario_id']); await useConnection(database, async (c) => { await c.execute('INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)', { projeto_id: parseId(req.params.id), usuario_id: req.body.usuario_id }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.get('/api/projetos/:id/membros', async (req, res, next) => {
    try { const members = await useConnection(database, async (c) => { const projetoId = parseId(req.params.id); if (!(await projetoVinculado(c, req.authUser, projetoId))) throw notFound('Projeto'); return c.query('SELECT u.id, u.nome, u.email, u.perfil FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND u.ativo = 1 ORDER BY u.nome', { projeto_id: projetoId }); }); res.json(members); }
    catch (error) { next(error); }
  });
  app.delete('/api/projetos/:projetoId/membros/:usuarioId', async (req, res, next) => {
    try { if (req.authUser.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode alterar os membros dos projetos.'); await useConnection(database, async (c) => { await c.execute('DELETE FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id', { projeto_id: parseId(req.params.projetoId), usuario_id: parseId(req.params.usuarioId) }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });

  app.get('/api/demandas', async (req, res, next) => {
    try {
      const binds = {}; const filters = [];
      for (const field of ['status', 'prioridade']) if (req.query[field]) { filters.push(`d.${field} = :${field}`); binds[field] = req.query[field]; }
      if (req.query.busca) { filters.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)'); binds.busca = `%${req.query.busca.toLowerCase()}%`; }
      if (req.authUser.perfil === 'LIDER') {
        filters.push('EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :usuario_id)');
        binds.usuario_id = req.authUser.id;
      } else if (req.authUser.perfil === 'MEMBRO') {
        filters.push('(EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :usuario_id) OR d.responsavel_id = :usuario_id)');
        binds.usuario_id = req.authUser.id;
      }
      const sql = `SELECT d.*, TO_CHAR(d.prazo, 'YYYY-MM-DD') AS prazo_iso, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY d.criado_em DESC`;
      const rows = await useConnection(database, (c) => c.query(sql, binds));
      res.json(rows.map(({ prazo_iso, ...row }) => ({ ...row, prazo: prazo_iso })));
    } catch (error) { next(error); }
  });
  app.get('/api/demandas/:id', async (req, res, next) => {
    try {
      const demandId = parseId(req.params.id);
      const data = await useConnection(database, async (c) => {
        const rows = await c.query("SELECT d.*, TO_CHAR(d.prazo, 'YYYY-MM-DD') AS prazo_iso, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id WHERE d.id = :id", { id: demandId });
        if (!rows.length) throw notFound('Demanda');
        await verificarAcessoDemanda(c, req.authUser, rows[0]);
        rows[0].prazo = rows[0].prazo_iso;
        delete rows[0].prazo_iso;
        const comentarios = await c.query('SELECT c.*, u.nome AS autor_nome FROM comentarios c JOIN usuarios u ON u.id = c.autor_id WHERE c.demanda_id = :id ORDER BY c.criado_em', { id: demandId });
        const historico = await c.query('SELECT h.*, u.nome AS autor_nome FROM historico_demandas h JOIN usuarios u ON u.id = h.autor_id WHERE h.demanda_id = :id ORDER BY h.criado_em', { id: demandId });
        return { ...rows[0], comentarios, historico };
      });
      res.json(data);
    } catch (error) { next(error); }
  });
  app.post('/api/demandas', async (req, res, next) => {
    try {
      if (req.authUser.perfil === 'MEMBRO') throw forbidden('Membros da equipe não podem criar demandas.');
      required(req.body, ['projeto_id', 'titulo', 'descricao', 'tipo', 'prioridade']);
      const projetoId = parseId(req.body.projeto_id);
      const titulo = validateText(req.body.titulo, 'O título', 3, 100);
      const descricao = validateText(req.body.descricao, 'A descrição', 10, 1000);
      if (!TIPOS.includes(req.body.tipo)) throw badRequest('Tipo de demanda inválido.');
      if (!PRIORIDADES.includes(req.body.prioridade)) throw badRequest('Prioridade inválida.');
      const prazo = parseDate(req.body.prazo);
      if (prazo && prazo < hojeEmSaoPaulo()) throw badRequest('O prazo não pode estar no passado.');
      if (prazo && await isNationalHoliday(prazo)) throw badRequest('O prazo não pode cair em um feriado nacional.');
      const demandId = await useConnection(database, async (c) => {
        try {
          const projetos = await c.query('SELECT id FROM projetos WHERE id = :id AND ativo = 1', { id: projetoId });
          if (!projetos.length) throw notFound('Projeto');
          if (!(await projetoVinculado(c, req.authUser, projetoId))) throw forbidden('Líderes só podem criar demandas nos projetos aos quais estão vinculados.');
          const responsavelId = req.body.responsavel_id ? parseId(req.body.responsavel_id) : null;
          if (responsavelId) {
            const membro = await c.query('SELECT 1 AS membro FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1', { projeto_id: projetoId, usuario_id: responsavelId });
            if (!membro.length) throw badRequest('O responsável deve ser um usuário ativo vinculado ao projeto.');
          }
          const result = await c.execute('INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo) VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo) RETURNING id INTO :id', { projeto_id: projetoId, criador_id: req.authUser.id, responsavel_id: responsavelId, titulo, descricao, tipo: req.body.tipo, prioridade: req.body.prioridade, prazo: prazo ? new Date(`${prazo}T00:00:00.000Z`) : null, id: outputId() });
          const createdId = result.outBinds.id[0];
          await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo) VALUES (:id, :autor_id, 'CRIACAO', :titulo)", { id: createdId, autor_id: req.authUser.id, titulo });
          await c.commit(); return createdId;
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(201).json({ id: demandId });
    } catch (error) { next(error); }
  });
  app.patch('/api/demandas/:id', async (req, res, next) => {
    try {
      const allowed = ['titulo', 'descricao', 'tipo', 'prioridade', 'status', 'prazo', 'responsavel_id'];
      const changes = Object.keys(req.body || {}).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => {
        try {
          const demandId = parseId(req.params.id);
          const rows = await c.query("SELECT d.*, TO_CHAR(d.prazo, 'YYYY-MM-DD') AS prazo_iso FROM demandas d WHERE d.id = :id FOR UPDATE", { id: demandId });
          if (!rows.length) throw notFound('Demanda');
          const current = rows[0];
          await verificarAcessoDemanda(c, req.authUser, current);
          const hasStatus = Object.hasOwn(req.body, 'status');
          const fields = changes.filter((field) => field !== 'status');
          if (req.authUser.perfil === 'MEMBRO') {
            if (fields.length || !hasStatus) throw forbidden('Membros só podem alterar o status de demandas atribuídas a eles.');
            if (Number(current.responsavel_id) !== Number(req.authUser.id)) throw forbidden('Você só pode alterar o status de demandas atribuídas a você.');
          } else if (!isPrivileged(req.authUser)) {
            throw forbidden('Perfil sem permissão para alterar demandas.');
          }

          const normalized = {};
          for (const field of fields) {
            if (field === 'titulo') normalized[field] = validateText(req.body[field], 'O título', 3, 100);
            else if (field === 'descricao') normalized[field] = validateText(req.body[field], 'A descrição', 10, 1000);
            else if (field === 'tipo') {
              if (!TIPOS.includes(req.body[field])) throw badRequest('Tipo de demanda inválido.');
              normalized[field] = req.body[field];
            } else if (field === 'prioridade') {
              if (!PRIORIDADES.includes(req.body[field])) throw badRequest('Prioridade inválida.');
              normalized[field] = req.body[field];
            } else if (field === 'responsavel_id') {
              normalized[field] = req.body[field] === null || req.body[field] === '' ? null : parseId(req.body[field]);
            } else if (field === 'prazo') {
              const prazo = parseDate(req.body[field]);
              if (prazo && prazo < hojeEmSaoPaulo()) throw badRequest('O prazo não pode estar no passado.');
              if (prazo && await isNationalHoliday(prazo)) throw badRequest('O prazo não pode cair em um feriado nacional.');
              normalized[field] = prazo ? new Date(`${prazo}T00:00:00.000Z`) : null;
            }
          }

          if (normalized.responsavel_id) {
            const membro = await c.query('SELECT 1 AS membro FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1', { projeto_id: current.projeto_id, usuario_id: normalized.responsavel_id });
            if (!membro.length) throw badRequest('O responsável deve ser um usuário ativo vinculado ao projeto.');
          }

          if (hasStatus) {
            const novoStatus = req.body.status;
            if (!STATUS_DEMANDA.includes(novoStatus)) throw badRequest('Status inválido.');
            const statusAtual = current.status;
            if (novoStatus === 'CANCELADA') {
              if (req.authUser.perfil === 'MEMBRO') throw forbidden('Membros não podem cancelar demandas.');
              if (statusAtual === 'CONCLUIDA') throw badRequest('Uma demanda concluída não pode ser cancelada.');
              if (statusAtual === 'CANCELADA') throw badRequest('A demanda já está cancelada.');
            } else if (!TRANSICOES_STATUS[statusAtual]?.includes(novoStatus)) {
              throw badRequest('Transição de status inválida. Siga o fluxo Aberta → Em andamento → Em revisão → Concluída.');
            } else if (req.authUser.perfil === 'MEMBRO' && !['ABERTA>EM_ANDAMENTO', 'EM_ANDAMENTO>EM_REVISAO'].includes(`${statusAtual}>${novoStatus}`)) {
              throw forbidden('Membros só podem mover demandas atribuídas de Aberta para Em andamento e de Em andamento para Em revisão.');
            }
            normalized.status = novoStatus;
          }

          const actualChanges = Object.keys(normalized).filter((field) => {
            const oldValue = field === 'prazo' ? current.prazo_iso : current[field];
            const newValue = field === 'prazo' ? (normalized[field] ? normalized[field].toISOString().slice(0, 10) : null) : normalized[field];
            return String(oldValue ?? '') !== String(newValue ?? '');
          });
          if (!actualChanges.length) { await c.commit(); return; }
          const binds = Object.fromEntries(actualChanges.map((field) => [field, normalized[field]]));
          binds.id = demandId;
          await c.execute(`UPDATE demandas SET ${actualChanges.map((field) => `${field} = :${field}`).join(', ')}, atualizado_em = SYSTIMESTAMP WHERE id = :id`, binds);
          for (const campo of actualChanges) {
            const valorAnterior = campo === 'prazo' ? current.prazo_iso : current[campo];
            const valorNovo = campo === 'prazo' && normalized[campo] ? normalized[campo].toISOString().slice(0, 10) : normalized[campo];
            await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo) VALUES (:id, :autor_id, 'ALTERACAO', :campo, :anterior, :novo)", { id: demandId, autor_id: req.authUser.id, campo, anterior: valorAnterior == null ? null : String(valorAnterior), novo: valorNovo == null ? null : String(valorNovo) });
          }
          await c.commit();
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/demandas/:id', async (req, res, next) => {
    next(Object.assign(new Error('Demandas não podem ser excluídas. Altere o status para CANCELADA.'), { status: 405 }));
  });
  app.post('/api/demandas/:id/comentarios', async (req, res, next) => {
    try {
      required(req.body, ['texto']);
      const texto = validateText(req.body.texto, 'O comentário', 3, 500);
      const commentId = await useConnection(database, async (c) => {
        const demandaId = parseId(req.params.id);
        const rows = await c.query('SELECT id, projeto_id, responsavel_id FROM demandas WHERE id = :id', { id: demandaId });
        if (!rows.length) throw notFound('Demanda');
        await verificarAcessoDemanda(c, req.authUser, rows[0]);
        const result = await c.execute('INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto) RETURNING id INTO :id', { demanda_id: demandaId, autor_id: req.authUser.id, texto, id: outputId() });
        await c.commit();
        return result.outBinds.id[0];
      });
      res.status(201).json({ id: commentId });
    } catch (error) { next(error); }
  });
  app.patch('/api/comentarios/:id', async (req, res, next) => {
    try { required(req.body, ['texto']); await useConnection(database, async (c) => { const comentarioId = parseId(req.params.id); const rows = await c.query('SELECT id, autor_id, demanda_id FROM comentarios WHERE id = :id', { id: comentarioId }); if (!rows.length) throw notFound('Comentário'); const demanda = await c.query('SELECT id, projeto_id, responsavel_id FROM demandas WHERE id = :id', { id: rows[0].demanda_id }); if (!demanda.length) throw notFound('Demanda'); await verificarAcessoDemanda(c, req.authUser, demanda[0]); if (Number(rows[0].autor_id) !== Number(req.authUser.id) && req.authUser.perfil !== 'ADMIN') throw forbidden('Somente o autor ou um administrador pode editar este comentário.'); const texto = validateText(req.body.texto, 'O comentário', 3, 500); await c.execute('UPDATE comentarios SET texto = :texto, atualizado_em = SYSTIMESTAMP WHERE id = :id', { texto, id: comentarioId }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.delete('/api/comentarios/:id', async (req, res, next) => {
    try { await useConnection(database, async (c) => { const comentarioId = parseId(req.params.id); const rows = await c.query('SELECT id, autor_id, demanda_id FROM comentarios WHERE id = :id', { id: comentarioId }); if (!rows.length) throw notFound('Comentário'); const demanda = await c.query('SELECT id, projeto_id, responsavel_id FROM demandas WHERE id = :id', { id: rows[0].demanda_id }); if (!demanda.length) throw notFound('Demanda'); await verificarAcessoDemanda(c, req.authUser, demanda[0]); if (Number(rows[0].autor_id) !== Number(req.authUser.id) && req.authUser.perfil !== 'ADMIN') throw forbidden('Somente o autor ou um administrador pode excluir este comentário.'); await c.execute('DELETE FROM comentarios WHERE id = :id', { id: comentarioId }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || (error.errorNum === 1 ? 409 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? (error.publicMessage || 'Erro interno ao acessar o banco.') : error.message });
  });
  return app;
}

module.exports = { createApp };

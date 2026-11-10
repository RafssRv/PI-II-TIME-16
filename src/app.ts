// Autor: Priscila Amorim 
// Descrição: Aplicação Express da API (autenticação, projetos, usuários, demandas, comentários,
// histórico e dashboard) com persistência em MySQL. Migrada para TypeScript em 08/11/2026 a partir
// do app.js original.

import express, { NextFunction, Request, Response } from 'express';
const path = require('node:path');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { isNationalHoliday } = require('./holidays');

type AuthUser = { id: number; nome: string; email: string; perfil: 'ADMIN' | 'LIDER' | 'MEMBRO' };
type Bindings = Record<string, any>;
type DbConnection = {
  query(sql: string, binds?: Bindings): Promise<any[]>;
  execute(sql: string, binds?: Bindings): Promise<{ affectedRows: number; insertId: number }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
};
type Database = { connection(): Promise<DbConnection> };
type AppOptions = {
  isHoliday?: (date: string) => Promise<boolean>;
  now?: () => Date;
  sessionSecret?: string;
  skipAuthorization?: boolean;
};

declare global {
  namespace Express {
    interface Request {
      authUser: AuthUser;
      bootstrap?: boolean;
    }
  }
}

// As ações de cadastro/login existentes são mantidas; regras abaixo tratam consultas e edição.
const ENUMS: Record<string, string[]> = {
  status: ['ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'],
  prioridade: ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'],
  tipo: ['TAREFA', 'DEFEITO', 'MELHORIA', 'DOCUMENTACAO']
};
const TRANSICOES: Record<string, string[]> = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['EM_REVISAO', 'CANCELADA'],
  EM_REVISAO: ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [], CANCELADA: []
};
const TRANSICOES_MEMBRO: Record<string, string[]> = {
  ABERTA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['EM_REVISAO']
};
const PERFIS = ['ADMIN', 'LIDER', 'MEMBRO'];
const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });
const forbidden = (message = 'Você não tem permissão para esta ação.') => Object.assign(new Error(message), { status: 403 });
function texto(value: any, label: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw badRequest(`${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return value.trim();
}
function dataCivil(value: any): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest('Prazo inválido: use AAAA-MM-DD.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1000-01-01') throw badRequest('Prazo inválido.');
  return value;
}
function hojeCivil(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function required(body: any, names: string[]) {
  for (const name of names) {
    if (body[name] === undefined || body[name] === null || String(body[name]).trim() === '') {
      throw Object.assign(new Error(`Campo obrigatório: ${name}`), { status: 400 });
    }
  }
}
const notFound = (name: string) => Object.assign(new Error(`${name} não encontrado.`), { status: 404 });
function parseId(value: any): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new Error('Identificador inválido.'), { status: 400 });
  return parsed;
}
function criarToken(usuarioId: number, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: usuarioId, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 })).toString('base64url');
  const mensagem = `${header}.${payload}`;
  const assinatura = crypto.createHmac('sha256', secret).update(mensagem).digest('base64url');
  return `${mensagem}.${assinatura}`;
}
function lerToken(token: string | null, secret: string): number | null {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [header, payload, assinatura] = partes;
  const mensagem = `${header}.${payload}`;
  const esperada = crypto.createHmac('sha256', secret).update(mensagem).digest();
  const recebida = Buffer.from(assinatura, 'base64url');
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  try {
    const cabecalho = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (cabecalho.alg !== 'HS256' || !Number.isInteger(claims.sub) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims.sub;
  } catch { return null; }
}
async function useConnection<T>(database: Database, work: (connection: DbConnection) => Promise<T>): Promise<T> {
  const connection = await database.connection();
  try { return await work(connection); } finally { await connection.close(); }
}

function createApp(database: Database, { isHoliday = isNationalHoliday, now = () => new Date(), sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), skipAuthorization = false }: AppOptions = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'PUT'].includes(req.method) &&
        (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
      return res.status(400).json({ error: 'Envie um objeto JSON válido no corpo da requisição.' });
    }
    next();
  });
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
  app.get('/', (_req, res) => res.redirect('/frontend/html/login.html'));

  app.get('/api/health', async (_req, res, next) => {
    try { await useConnection(database, (c) => c.query('SELECT 1 AS ok')); res.json({ database: 'online' }); }
    catch (error) { next(Object.assign(error, { status: 503 })); }
  });

  /*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Rota de autenticação dos usuários do sistema
  
  Recebe e-mail e senha, verifica os campos obrigatórios,
  consulta o usuário no banco e compara a senha com o hash armazenado.
  Retorna os dados do usuário e o token de sessão, sem expor a senha ou seu hash.
  Retorna erro quando os dados obrigatórios estão ausentes ou as credenciais
  são inválidas.
  */
  app.post('/api/login', async (req, res, next) => {
    try {
      required(req.body, ['email', 'senha']);
      const users = await useConnection(database, (c) => c.query('SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE LOWER(email) = LOWER(:email) AND ativo = 1', { email: req.body.email.trim() }));
      if (!users.length || !(await bcrypt.compare(req.body.senha, users[0].senha_hash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      const { senha_hash, ...user } = users[0];
      res.json({ usuario: user, token: criarToken(user.id, sessionSecret) });
    } catch (error) { next(error); }
  });

  app.use('/api', async (req, res, next) => {
    if (skipAuthorization) {
      req.authUser = { id: 1, nome: 'Usuário de teste', email: 'teste@local.test', perfil: 'ADMIN' };
      return next();
    }
    if (req.path === '/health' || (req.path === '/login' && req.method === 'POST')) return next();
    try {
      if (req.path === '/usuarios' && req.method === 'POST') {
        const users = await useConnection(database, (c) => c.query('SELECT COUNT(*) AS total FROM usuarios'));
        if (Number(users[0]?.total || 0) === 0) { req.bootstrap = true; return next(); }
      }
      const authorization = req.get('authorization') || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
      const usuarioId = lerToken(token, sessionSecret);
      if (!usuarioId) return res.status(401).json({ error: 'Autenticação necessária ou sessão expirada.' });
      const users = await useConnection(database, (c) => c.query('SELECT id, nome, email, perfil FROM usuarios WHERE id = :id AND ativo = 1', { id: usuarioId }));
      if (!users.length) return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      req.authUser = users[0];
      next();
    } catch (error) { next(error); }
  });

  const isAdmin = (req: Request) => req.authUser?.perfil === 'ADMIN';
  const isManager = (req: Request) => ['ADMIN', 'LIDER'].includes(req.authUser?.perfil);
  async function canAccessProject(connection: DbConnection, usuario: AuthUser, projetoId: number) {
    if (usuario.perfil === 'ADMIN') return true;
    const rows = await connection.query('SELECT 1 FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id', { projeto_id: projetoId, usuario_id: usuario.id });
    return rows.length > 0;
  }
  async function canAccessDemand(connection: DbConnection, usuario: AuthUser, demanda: any) {
    if (usuario.perfil === 'ADMIN') return true;
    return canAccessProject(connection, usuario, demanda.projeto_id);
  }

  /*
  Autora: Sophia Franco de Godoy / RA: 24000833
  Descrição: Rota de listagem dos usuários do sistema

  Consulta os usuários no banco conforme as permissões
  do usuário autenticado e retorna os dados em formato JSON.
  A resposta não inclui senhas nem hashes de senha.
  */
  app.get('/api/usuarios', async (_req, res, next) => {
    try {
      const usuario = _req.authUser;
      const users = await useConnection(database, (c) => usuario.perfil === 'ADMIN'
        ? c.query('SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios ORDER BY nome')
        : c.query(`SELECT DISTINCT u.id, u.nome, u.email, u.perfil, u.ativo, u.criado_em, u.atualizado_em
            FROM usuarios u
            WHERE u.ativo = 1 AND (u.id = :usuario_id OR EXISTS (
              SELECT 1 FROM projeto_membros meus
              JOIN projeto_membros deles ON deles.projeto_id = meus.projeto_id
              WHERE meus.usuario_id = :usuario_id AND deles.usuario_id = u.id
            )) ORDER BY u.nome`, { usuario_id: usuario.id }));
      res.json(users);
    }
    catch (error) { next(error); }
  });
  app.post('/api/usuarios', async (req, res, next) => {
    try {
      if (!req.bootstrap && !isAdmin(req)) throw forbidden('Somente um administrador pode cadastrar usuários.');
      required(req.body, ['nome', 'email', 'senha', 'perfil']);
      if (req.bootstrap && req.body.perfil !== 'ADMIN') throw forbidden('O primeiro usuário precisa ser ADMIN.');
      if (!PERFIS.includes(req.body.perfil)) throw badRequest('Perfil inválido. Use ADMIN, LIDER ou MEMBRO.');
      const nome = texto(req.body.nome, 'Nome', 2, 100);
      const email = texto(req.body.email, 'E-mail', 5, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('E-mail inválido.');
      if (typeof req.body.senha !== 'string' || req.body.senha.length < 10 || req.body.senha.length > 200) throw badRequest('A senha deve ter entre 10 e 200 caracteres.');
      const senha_hash = await bcrypt.hash(req.body.senha, 12);
      const userId = await useConnection(database, async (c) => {
        let bootstrapLock = false;
        try {
          if (req.bootstrap) {
            const lock = await c.query("SELECT GET_LOCK('pi2_demandas_first_admin', 10) AS acquired");
            if (Number(lock[0]?.acquired) !== 1) throw Object.assign(new Error('Não foi possível iniciar o cadastro inicial; tente novamente.'), { status: 503 });
            bootstrapLock = true;
            const existing = await c.query('SELECT COUNT(*) AS total FROM usuarios');
            if (Number(existing[0]?.total || 0) !== 0) throw forbidden('O cadastro inicial já foi concluído. Entre como ADMIN para cadastrar outros usuários.');
          }
          const result = await c.execute('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (:nome, :email, :senha_hash, :perfil)', { nome, email, senha_hash, perfil: req.body.perfil });
          await c.commit(); return result.insertId;
        } catch (error) {
          await c.rollback();
          throw error;
        } finally {
          if (bootstrapLock) await c.query("SELECT RELEASE_LOCK('pi2_demandas_first_admin')");
        }
      });
      res.status(201).json({ id: userId });
    } catch (error) { next(error); }
  });
  app.patch('/api/usuarios/:id', async (req, res, next) => {
    try {
      if (!isAdmin(req)) throw forbidden('Somente um administrador pode alterar usuários.');
      const allowed = ['nome', 'email', 'perfil', 'ativo'];
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      for (const field of changes) {
        if (field === 'nome') req.body.nome = texto(req.body.nome, 'Nome', 2, 100);
        if (field === 'email') {
          req.body.email = texto(req.body.email, 'E-mail', 5, 254).toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) throw badRequest('E-mail inválido.');
        }
        if (field === 'perfil' && !PERFIS.includes(req.body.perfil)) throw badRequest('Perfil inválido.');
        if (field === 'ativo' && ![0, 1, false, true].includes(req.body.ativo)) throw badRequest('Estado ativo inválido.');
      }
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
      if (!isAdmin(req)) throw forbidden('Somente um administrador pode desativar usuários.');
      await useConnection(database, async (c) => { const result = await c.execute('UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id', { id: parseId(req.params.id) }); if (!result.affectedRows) throw notFound('Usuário'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/projetos', async (_req, res, next) => {
    try {
      const usuario = _req.authUser;
      const incluirInativos = _req.query.incluir_inativos;
      if (incluirInativos !== undefined && (typeof incluirInativos !== 'string' || !['0', '1'].includes(incluirInativos))) throw badRequest('Filtro de projetos inválido.');
      if (incluirInativos === '1' && usuario.perfil !== 'ADMIN') throw forbidden('Somente um administrador pode consultar todos os projetos inativos.');
      // Cadastros e transferências continuam recebendo somente projetos ativos por padrão.
      const projects = await useConnection(database, (c) => usuario.perfil === 'ADMIN'
        ? c.query(`SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM projetos ${incluirInativos === '1' ? '' : 'WHERE ativo = 1'} ORDER BY nome`)
        : c.query(`SELECT p.id, p.nome, p.descricao, p.ativo, p.criado_em, p.atualizado_em
            FROM projetos p JOIN projeto_membros pm ON pm.projeto_id = p.id
            WHERE pm.usuario_id = :usuario_id AND p.ativo = 1 ORDER BY p.nome`, { usuario_id: usuario.id }));
      res.json(projects);
    }
    catch (error) { next(error); }
  });
  app.post('/api/projetos', async (req, res, next) => {
    try {
      if (!isAdmin(req)) throw forbidden('Somente um administrador pode cadastrar projetos.');
      required(req.body, ['nome']);
      const projectId = await useConnection(database, async (c) => { const result = await c.execute('INSERT INTO projetos (nome, descricao) VALUES (:nome, :descricao)', { nome: texto(req.body.nome, 'Nome do projeto', 2, 100), descricao: req.body.descricao ? texto(req.body.descricao, 'Descrição', 1, 1000) : null }); await c.commit(); return result.insertId; });
      res.status(201).json({ id: projectId });
    } catch (error) { next(error); }
  });
  app.patch('/api/projetos/:id', async (req, res, next) => {
    try {
      if (!isAdmin(req)) throw forbidden('Somente um administrador pode alterar projetos.');
      const allowed = ['nome', 'descricao', 'ativo'];
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw Object.assign(new Error('Nenhum campo permitido informado.'), { status: 400 });
      await useConnection(database, async (c) => { const binds = Object.fromEntries(changes.map((key) => [key, req.body[key]])); binds.id = parseId(req.params.id); const result = await c.execute(`UPDATE projetos SET ${changes.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`, binds); if (!result.affectedRows) throw notFound('Projeto'); await c.commit(); });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/projetos/:id', async (req, res, next) => {
    try { if (!isAdmin(req)) throw forbidden('Somente um administrador pode desativar projetos.'); await useConnection(database, async (c) => { const result = await c.execute('UPDATE projetos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id', { id: parseId(req.params.id) }); if (!result.affectedRows) throw notFound('Projeto'); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });
  app.post('/api/projetos/:id/membros', async (req, res, next) => {
    try {
      if (!isAdmin(req)) throw forbidden('Somente um administrador pode gerenciar a equipe do projeto.');
      required(req.body, ['usuario_id']);
      await useConnection(database, async (c) => {
        const projectId = parseId(req.params.id), userId = parseId(req.body.usuario_id);
        const projects = await c.query('SELECT id FROM projetos WHERE id = :id AND ativo = 1', { id: projectId });
        const users = await c.query('SELECT id FROM usuarios WHERE id = :id AND ativo = 1', { id: userId });
        if (!projects.length || !users.length) throw badRequest('Projeto e usuário precisam estar ativos.');
        await c.execute('INSERT INTO projeto_membros (projeto_id, usuario_id) VALUES (:projeto_id, :usuario_id)', { projeto_id: projectId, usuario_id: userId });
        await c.commit();
      });
      res.status(204).end();
    }
    catch (error) { next(error); }
  });
  app.get('/api/projetos/:id/membros', async (req, res, next) => {
    try {
      const projectId = parseId(req.params.id);
      const members = await useConnection(database, async (c) => {
        if (!await canAccessProject(c, req.authUser, projectId)) throw notFound('Projeto');
        return c.query('SELECT u.id, u.nome, u.email, u.perfil FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND u.ativo = 1 ORDER BY u.nome', { projeto_id: projectId });
      });
      res.json(members);
    }
    catch (error) { next(error); }
  });
  app.delete('/api/projetos/:projetoId/membros/:usuarioId', async (req, res, next) => {
    try { if (!isAdmin(req)) throw forbidden('Somente um administrador pode gerenciar a equipe do projeto.'); await useConnection(database, async (c) => { await c.execute('DELETE FROM projeto_membros WHERE projeto_id = :projeto_id AND usuario_id = :usuario_id', { projeto_id: parseId(req.params.projetoId), usuario_id: parseId(req.params.usuarioId) }); await c.commit(); }); res.status(204).end(); }
    catch (error) { next(error); }
  });

  app.get('/api/demandas', async (req, res, next) => {
    try {
      const query: Record<string, any> = req.query;
      const binds: Bindings = {}; const filters: string[] = [];
      for (const field of ['status', 'prioridade', 'tipo', 'projeto_id', 'responsavel_id', 'busca', 'ordenacao']) {
        if (query[field] !== undefined && typeof query[field] !== 'string') throw badRequest(`Filtro inválido: ${field}.`);
      }
      for (const field of ['status', 'prioridade', 'tipo']) if (query[field]) {
        if (!ENUMS[field].includes(query[field])) throw badRequest(`Filtro inválido: ${field}.`);
        filters.push(`d.${field} = :${field}`); binds[field] = query[field];
      }
      for (const field of ['projeto_id', 'responsavel_id']) if (query[field]) {
        filters.push(`d.${field} = :${field}`); binds[field] = parseId(query[field]);
      }
      if (req.authUser.perfil === 'LIDER') {
        filters.push('EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id)');
        binds.scope_usuario_id = req.authUser.id;
      } else if (req.authUser.perfil === 'MEMBRO') {
        filters.push('EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id)');
        binds.scope_usuario_id = req.authUser.id;
      }
      if (query.busca) { filters.push('(LOWER(d.titulo) LIKE :busca OR LOWER(d.descricao) LIKE :busca)'); binds.busca = `%${query.busca.toLowerCase()}%`; }
      // Somente expressões fixas entram no ORDER BY; valores do cliente ficam em binds.
      const orders: Record<string, string> = {
        criacao_desc: 'd.criado_em DESC, d.id DESC',
        prazo_asc: 'd.prazo IS NULL, d.prazo ASC, d.id DESC',
        prioridade_desc: "FIELD(d.prioridade, 'CRITICA', 'ALTA', 'MEDIA', 'BAIXA'), d.id DESC",
        status: "FIELD(d.status, 'ABERTA', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDA', 'CANCELADA'), d.id DESC"
      };
      const order = query.ordenacao || 'criacao_desc';
      if (!Object.hasOwn(orders, order)) throw badRequest('Ordenação inválida.');
      const sql = `SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY ${orders[order]}`;
      res.json(await useConnection(database, (c) => c.query(sql, binds)));
    } catch (error) { next(error); }
  });

  app.get('/api/dashboard', async (_req, res, next) => {
    try {
      const usuario = _req.authUser;
      const scope = usuario.perfil === 'ADMIN' ? '' : usuario.perfil === 'LIDER'
        ? 'WHERE EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id)'
        : 'WHERE EXISTS (SELECT 1 FROM projeto_membros pm WHERE pm.projeto_id = d.projeto_id AND pm.usuario_id = :scope_usuario_id)';
      const demandas = await useConnection(database, (c) => c.query(`SELECT d.*, p.nome AS projeto_nome, u.nome AS responsavel_nome FROM demandas d JOIN projetos p ON p.id = d.projeto_id LEFT JOIN usuarios u ON u.id = d.responsavel_id ${scope} ORDER BY d.prazo IS NULL, d.prazo, d.id`, usuario.perfil === 'ADMIN' ? {} : { scope_usuario_id: usuario.id }));
      const hoje = hojeCivil(now());
      const limite = new Date(`${hoje}T00:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 7);
      const ultimoDia = limite.toISOString().slice(0, 10);
      const contar = (campo: string) => Object.fromEntries(ENUMS[campo].map((value) => [value, demandas.filter((d) => d[campo] === value).length]));
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
        if (!await canAccessDemand(c, req.authUser, rows[0])) throw notFound('Demanda');
        const comentarios = await c.query('SELECT c.*, u.nome AS autor_nome FROM comentarios c JOIN usuarios u ON u.id = c.autor_id WHERE c.demanda_id = :id ORDER BY c.criado_em', { id: demandId });
        const historico = await c.query('SELECT h.*, u.nome AS autor_nome FROM historico_demandas h JOIN usuarios u ON u.id = h.autor_id WHERE h.demanda_id = :id ORDER BY h.criado_em', { id: demandId });
        return { ...rows[0], comentarios, historico };
      });
      res.json(data);
    } catch (error) { next(error); }
  });
  app.post('/api/demandas', async (req, res, next) => {
    try {
      if (!isManager(req)) throw forbidden('Membros da equipe não podem criar demandas.');
      required(req.body, ['projeto_id', 'titulo', 'descricao', 'tipo', 'prioridade']);
      const projetoId = parseId(req.body.projeto_id);
      const titulo = texto(req.body.titulo, 'Título', 3, 100);
      const descricao = texto(req.body.descricao, 'Descrição', 10, 1000);
      if (!ENUMS.tipo.includes(req.body.tipo)) throw badRequest('Tipo de demanda inválido.');
      if (!ENUMS.prioridade.includes(req.body.prioridade)) throw badRequest('Prioridade inválida.');
      const responsavelId = req.body.responsavel_id == null || req.body.responsavel_id === '' ? null : parseId(req.body.responsavel_id);
      const prazo = dataCivil(req.body.prazo ?? null);
      if (prazo && prazo < hojeCivil(now())) throw badRequest('O prazo não pode estar no passado.');
      if (prazo && await isHoliday(prazo)) throw badRequest('O prazo não pode cair em um feriado nacional.');
      const demandId = await useConnection(database, async (c) => {
        try {
          const projects = await c.query('SELECT id FROM projetos WHERE id = :id AND ativo = 1', { id: projetoId });
          if (!projects.length) throw badRequest('O projeto precisa existir e estar ativo.');
          if (req.authUser.perfil === 'LIDER' && !await canAccessProject(c, req.authUser, projetoId)) throw forbidden('Líderes só podem criar demandas nos projetos aos quais estão vinculados.');
          if (responsavelId) {
            const members = await c.query('SELECT u.id FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1', { projeto_id: projetoId, usuario_id: responsavelId });
            if (!members.length) throw badRequest('O responsável deve ser um usuário ativo vinculado ao projeto.');
          }
          const result = await c.execute('INSERT INTO demandas (projeto_id, criador_id, responsavel_id, titulo, descricao, tipo, prioridade, prazo) VALUES (:projeto_id, :criador_id, :responsavel_id, :titulo, :descricao, :tipo, :prioridade, :prazo)', { projeto_id: projetoId, criador_id: req.authUser.id, responsavel_id: responsavelId, titulo, descricao, tipo: req.body.tipo, prioridade: req.body.prioridade, prazo });
          const createdId = result.insertId;
          await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, valor_novo) VALUES (:id, :autor_id, 'CRIACAO', :titulo)", { id: createdId, autor_id: req.authUser.id, titulo });
          await c.commit(); return createdId;
        } catch (error) { await c.rollback(); throw error; }
      });
      res.status(201).json({ id: demandId });
    } catch (error) { next(error); }
  });
  app.patch('/api/demandas/:id', async (req, res, next) => {
    try {
      const allowed = ['titulo', 'descricao', 'tipo', 'prioridade', 'status', 'prazo', 'responsavel_id', 'projeto_id'];
      const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
      if (!changes.length) throw badRequest('Nenhum campo permitido informado.');
      const membro = req.authUser.perfil === 'MEMBRO';
      if (membro && changes.some((field) => field !== 'status')) throw forbidden('Membros da equipe só podem alterar o status de demandas atribuídas a eles.');
      const values: Bindings = {};
      for (const field of changes) {
        const value = req.body[field];
        if (field === 'titulo') values[field] = texto(value, 'Título', 3, 100);
        else if (field === 'descricao') values[field] = texto(value, 'Descrição', 10, 1000);
        else if (ENUMS[field]) {
          if (!ENUMS[field].includes(value)) throw badRequest(`Valor inválido: ${field}.`);
          values[field] = value;
        } else if (field === 'projeto_id') values[field] = parseId(value);
        else if (field === 'responsavel_id') values[field] = value === null || value === '' ? null : parseId(value);
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
          if (!await canAccessDemand(c, req.authUser, rows[0])) throw notFound('Demanda');
          if (membro && Number(rows[0].responsavel_id) !== Number(req.authUser.id)) throw forbidden('Membros só podem alterar o status das demandas atribuídas a eles.');
          if (membro && (!values.status || !TRANSICOES_MEMBRO[rows[0].status]?.includes(values.status))) throw forbidden('Membros só podem avançar demandas atribuídas de Aberta para Em andamento e de Em andamento para Em revisão.');
          if (values.status && values.status !== rows[0].status && !TRANSICOES[rows[0].status]?.includes(values.status)) throw badRequest('Transição de status inválida. Siga o ciclo Aberta → Em andamento → Em revisão → Concluída.');
          const projetoId = values.projeto_id ?? Number(rows[0].projeto_id);
          const mudouProjeto = projetoId !== Number(rows[0].projeto_id);
          if (mudouProjeto) {
            const projetos = await c.query('SELECT id FROM projetos WHERE id = :id AND ativo = 1', { id: projetoId });
            if (!projetos.length) throw badRequest('O projeto de destino precisa existir e estar ativo.');
            if (!await canAccessProject(c, req.authUser, projetoId)) throw forbidden('Você precisa ter acesso aos projetos de origem e de destino para mover a demanda.');
          }
          // Valida o responsável no destino e registra sua remoção quando ele não pertence à nova equipe.
          const informouResponsavel = changes.includes('responsavel_id');
          const responsavelId = informouResponsavel ? values.responsavel_id : rows[0].responsavel_id;
          if (responsavelId && (mudouProjeto || informouResponsavel)) {
            const membros = await c.query('SELECT u.id FROM projeto_membros pm JOIN usuarios u ON u.id = pm.usuario_id WHERE pm.projeto_id = :projeto_id AND pm.usuario_id = :usuario_id AND u.ativo = 1', { projeto_id: projetoId, usuario_id: responsavelId });
            if (!membros.length) {
              if (informouResponsavel) throw badRequest('O responsável deve ser um usuário ativo vinculado ao projeto.');
              values.responsavel_id = null;
              changes.push('responsavel_id');
            }
          }
          const actualChanges = changes.filter((field) => String(rows[0][field] ?? '') !== String(values[field] ?? ''));
          if (actualChanges.length) {
            const binds = Object.fromEntries(actualChanges.map((field) => [field, values[field]])); binds.id = demandId;
            await c.execute(`UPDATE demandas SET ${actualChanges.map((key) => `${key} = :${key}`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id`, binds);
            for (const campo of actualChanges) await c.execute("INSERT INTO historico_demandas (demanda_id, autor_id, acao, campo, valor_anterior, valor_novo) VALUES (:id, :autor_id, 'ALTERACAO', :campo, :anterior, :novo)", { id: demandId, autor_id: req.authUser.id, campo, anterior: rows[0][campo] == null ? null : String(rows[0][campo]), novo: values[campo] == null ? null : String(values[campo]) });
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
  app.get('/api/demandas/:id/comentarios', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const comentarios = await useConnection(database, async (c) => {
        const demandas = await c.query('SELECT * FROM demandas WHERE id = :id', { id });
        if (!demandas.length) throw notFound('Demanda');
        if (!await canAccessDemand(c, req.authUser, demandas[0])) throw notFound('Demanda');
        return c.query('SELECT c.*, u.nome AS autor_nome FROM comentarios c JOIN usuarios u ON u.id = c.autor_id WHERE c.demanda_id = :id ORDER BY c.criado_em, c.id', { id });
      });
      res.json(comentarios);
    } catch (error) { next(error); }
  });
  app.post('/api/demandas/:id/comentarios', async (req, res, next) => {
    try {
      required(req.body || {}, ['texto']);
      const comment = texto(req.body.texto, 'Comentário', 3, 500);
      const commentId = await useConnection(database, async (c) => {
        const demandaId = parseId(req.params.id);
        const demandas = await c.query('SELECT * FROM demandas WHERE id = :id', { id: demandaId });
        if (!demandas.length || !await canAccessDemand(c, req.authUser, demandas[0])) throw notFound('Demanda');
        const result = await c.execute('INSERT INTO comentarios (demanda_id, autor_id, texto) VALUES (:demanda_id, :autor_id, :texto)', { demanda_id: demandaId, autor_id: req.authUser.id, texto: comment });
        await c.commit(); return result.insertId;
      });
      res.status(201).json({ id: commentId });
    } catch (error) { next(error); }
  });
  app.patch('/api/comentarios/:id', async (req, res, next) => {
    try {
      required(req.body || {}, ['texto']);
      const comment = texto(req.body.texto, 'Comentário', 3, 500);
      await useConnection(database, async (c) => {
        const id = parseId(req.params.id);
        const rows = await c.query('SELECT c.id, c.autor_id, d.* FROM comentarios c JOIN demandas d ON d.id = c.demanda_id WHERE c.id = :id', { id });
        if (!rows.length) throw notFound('Comentário');
        if (!await canAccessDemand(c, req.authUser, rows[0])) throw notFound('Comentário');
        if (!isAdmin(req) && Number(rows[0].autor_id) !== Number(req.authUser.id)) throw forbidden('Você só pode editar seus próprios comentários.');
        await c.execute('UPDATE comentarios SET texto = :texto, atualizado_em = CURRENT_TIMESTAMP(6) WHERE id = :id', { texto: comment, id });
        await c.commit();
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.delete('/api/comentarios/:id', async (req, res, next) => {
    try {
      await useConnection(database, async (c) => {
        const id = parseId(req.params.id);
        const rows = await c.query('SELECT c.id, c.autor_id, d.* FROM comentarios c JOIN demandas d ON d.id = c.demanda_id WHERE c.id = :id', { id });
        if (!rows.length) throw notFound('Comentário');
        if (!await canAccessDemand(c, req.authUser, rows[0])) throw notFound('Comentário');
        if (!isAdmin(req) && Number(rows[0].autor_id) !== Number(req.authUser.id)) throw forbidden('Você só pode excluir seus próprios comentários.');
        await c.execute('DELETE FROM comentarios WHERE id = :id', { id });
        await c.commit();
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const invalidData = ['ER_NO_REFERENCED_ROW_2', 'ER_CHECK_CONSTRAINT_VIOLATED', 'ER_DATA_TOO_LONG', 'ER_BAD_NULL_ERROR', 'ER_TRUNCATED_WRONG_VALUE'];
    const status = error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : invalidData.includes(error.code) ? 400 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? (error.publicMessage || 'Erro interno ao acessar o banco.') : invalidData.includes(error.code) ? 'Dados inválidos ou referência inexistente.' : error.message });
  });
  return app;
}

export { createApp };

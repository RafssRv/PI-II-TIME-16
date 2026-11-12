/*
  Autora: Priscila Amorim dos Santos / RA: 24787350
  Descrição: Configuração principal do aplicativo Express (middlewares, autenticação de sessão
  e registro das rotas dos 5 integrantes do grupo na pasta src/rotas/).
*/
import express, { NextFunction, Request, Response } from 'express';
import { registrarCadastroDemandaEProjetos } from './rotas/cadastro-demanda';
import { registrarDashboard } from './rotas/dashboard';
import { registrarDetalhesEComentarios } from './rotas/detalhes-comentarios';
import { registrarListagemDemandas } from './rotas/listagem-demandas';
import { registrarLogin } from './rotas/login';
import { registrarUsuarios } from './rotas/usuarios';

const path = require('node:path');
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

// Verifica a assinatura e validade do token de sessão enviado no cabeçalho Authorization.
function lerToken(token: string | null, segredo: string): number | null {
  if (typeof token !== 'string') return null;

  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [header, payload, assinatura] = partes;
  const mensagem = `${header}.${payload}`;
  const esperada = crypto.createHmac('sha256', segredo).update(mensagem).digest();
  const recebida = Buffer.from(assinatura, 'base64url');

  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) {
    return null;
  }

  try {
    const cabecalho = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (cabecalho.alg !== 'HS256' || !Number.isInteger(claims.sub) || claims.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims.sub;
  } catch {
    return null;
  }
}

function createApp(
  database: Database,
  {
    isHoliday = isNationalHoliday,
    now = () => new Date(),
    sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    skipAuthorization = false
  }: AppOptions = {}
) {
  const app = express();

  // Permite que o Express leia dados enviados em formato JSON no corpo da requisição (req.body).
  app.use(express.json());

  // Garante que requisições de escrita enviem um objeto JSON válido.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (
      ['POST', 'PATCH', 'PUT'].includes(req.method) &&
      (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      return res.status(400).json({ error: 'Envie um objeto JSON válido no corpo da requisição.' });
    }
    next();
  });

  // Disponibiliza os arquivos estáticos do frontend (HTML, CSS e JS).
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
  app.get('/', (_req: Request, res: Response) => res.redirect('/frontend/html/login.html'));

  // Rota de verificação da conexão com o banco de dados.
  app.get('/api/health', async (_req: Request, res: Response) => {
    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();
      await conexao.query('SELECT 1 AS ok');
      return res.status(200).json({ database: 'online' });
    } catch (erro) {
      console.error(erro);
      return res.status(503).json({ error: 'Banco de dados indisponível.' });
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Aluna 1 (Sophia): Rota pública de Login (POST /api/login).
  registrarLogin(app, database, sessionSecret);

  // Middleware de autenticação para proteger as demais rotas de /api.
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    if (skipAuthorization) {
      req.authUser = { id: 1, nome: 'Usuário de teste', email: 'teste@local.test', perfil: 'ADMIN' };
      return next();
    }

    if (req.path === '/health' || (req.path === '/login' && req.method === 'POST')) {
      return next();
    }

    let conexao: DbConnection | undefined;
    try {
      conexao = await database.connection();

      if (req.path === '/usuarios' && req.method === 'POST') {
        const usuariosCadastrados = await conexao.query('SELECT COUNT(*) AS total FROM usuarios');
        if (Number(usuariosCadastrados[0]?.total || 0) === 0) {
          req.bootstrap = true;
          return next();
        }
      }

      const authorization = req.get('authorization') || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
      const usuarioId = lerToken(token, sessionSecret);

      if (!usuarioId) {
        return res.status(401).json({ error: 'Autenticação necessária ou sessão expirada.' });
      }

      const usuarios = await conexao.query(
        'SELECT id, nome, email, perfil FROM usuarios WHERE id = :id AND ativo = 1',
        { id: usuarioId }
      );

      if (usuarios.length === 0) {
        return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      }

      req.authUser = usuarios[0];
      next();
    } catch (erro) {
      next(erro);
    } finally {
      if (conexao) await conexao.close();
    }
  });

  // Aluna 1 (Sophia): Rotas de Usuários (GET, POST, PATCH e DELETE /api/usuarios).
  registrarUsuarios(app, database);

  // Aluno 2 (Vinícius): Rota de Dashboard (GET /api/dashboard).
  registrarDashboard(app, database, now);

  // Aluna 3 (Heloisa): Rota de Listagem de Demandas com filtros, busca e ordenação (GET /api/demandas).
  registrarListagemDemandas(app, database);

  // Aluno 4 (Rafael): Rotas de Cadastro de Demanda e Projetos (POST /api/demandas e /api/projetos).
  registrarCadastroDemandaEProjetos(app, database, now, isHoliday);

  // Aluna 5 (Priscila): Rotas de Detalhes da Demanda, Edição e Comentários (/api/demandas/:id e comentários).
  registrarDetalhesEComentarios(app, database, now, isHoliday);

  // Redirecionamentos para manter compatibilidade com chamadas sem o prefixo /api.
  app.use('/dashboard', (req: Request, res: Response) =>
    res.redirect(307, `/api/dashboard${req.url === '/' ? '' : req.url}`)
  );
  app.use('/demandas', (req: Request, res: Response) =>
    res.redirect(307, `/api/demandas${req.url === '/' ? '' : req.url}`)
  );
  app.use('/projetos', (req: Request, res: Response) =>
    res.redirect(307, `/api/projetos${req.url === '/' ? '' : req.url}`)
  );

  // Resposta padrão 404 para rotas da API que não existem.
  app.use('/api', (_req: Request, res: Response) => {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  });

  // Tratamento geral de erros inesperados.
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({
      error: status >= 500 ? 'Erro interno ao acessar o banco.' : error.message
    });
  });

  return app;
}

export { createApp };
export type { Database, DbConnection };
